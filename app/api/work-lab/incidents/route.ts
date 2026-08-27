import { NextResponse } from "next/server";
import { getSupabaseUser, supabaseRest } from "../../../../lib/supabase";

type Doc={document_number:string;document_type:string;status:string;header:Record<string,unknown>;items:Array<Record<string,unknown>>};
type Incident={id:string;incident_type:string;title:string;description:string;priority:string;source_document_number:string|null;status:string;created_at:string};
type Attempt={id:string;incident_id:string;score:number;ai_help_count:number;result:string;created_at:string};

function tokenFrom(request:Request){const auth=request.headers.get("authorization");return auth?.startsWith("Bearer ")?auth.slice(7):undefined;}
function normalizeText(value:string){return value.trim().toLowerCase();}
function includesAny(text:string,terms:string[]){return terms.some(term=>text.includes(term));}
function canonicalDocumentType(value:string){return value.trim().toUpperCase().replace(/^MM-/,"");}

async function getContext(request:Request){
  const token=tokenFrom(request);if(!token)return null;
  const user=await getSupabaseUser(token);if(!user)return null;
  const courses=await supabaseRest<{id:string}[]>("courses?slug=eq.sap-mm-level-1&select=id&limit=1",{},token);
  const course=courses[0];if(!course)return null;
  const enrollments=await supabaseRest<Array<{status:string;progress_percent:number}>>(`enrollments?user_id=eq.${user.id}&course_id=eq.${course.id}&select=status,progress_percent&limit=1`,{},token);
  const enrollment=enrollments[0];
  const unlocked=enrollment?.status==="completed"&&Number(enrollment.progress_percent)>=100;
  return {token,user,unlocked};
}

async function ensureIncidents(userId:string,token:string){
  const docs=await supabaseRest<Doc[]>(`erp_documents?user_id=eq.${userId}&select=document_number,document_type,status,header,items&order=created_at.asc`,{},token);
  const pos=docs.filter(d=>canonicalDocumentType(d.document_type)==="PO");const grs=docs.filter(d=>canonicalDocumentType(d.document_type)==="GR");const ivs=docs.filter(d=>canonicalDocumentType(d.document_type)==="IV");
  const candidates:Array<Record<string,unknown>>=[];
  for(const iv of ivs.filter(d=>d.status==="blocked")){
    const source=String(iv.header.source_po??"");
    candidates.push({user_id:userId,incident_type:"invoice_blocked",title:"Supplier invoice is blocked",description:`Invoice ${iv.document_number} is blocked. Investigate the linked purchase order and goods receipts, identify why it failed validation, and recommend the correct next action.`,priority:"high",source_document_number:iv.document_number,expected_resolution:{root_cause_terms:["invoice mismatch","value mismatch","price mismatch","amount mismatch","three-way match"],resolution_terms:["correct invoice","contact supplier","verify po","verify goods receipt","block payment","repost invoice"],linked_document:source}});
  }
  for(const po of pos){
    const linked=grs.filter(gr=>String(gr.header.source_po??"")===po.document_number);const ordered=Number(po.items?.[0]?.quantity??0);const received=linked.reduce((sum,gr)=>sum+Number(gr.items?.[0]?.received_quantity??0),0);
    if(linked.length===0)candidates.push({user_id:userId,incident_type:"po_no_receipt",title:"Purchase order has no goods receipt",description:`PO ${po.document_number} is posted but no goods receipt exists. Determine what is missing from the process and what must be confirmed before proceeding.`,priority:"normal",source_document_number:po.document_number,expected_resolution:{root_cause_terms:["no goods receipt","goods not received","receipt missing","delivery not posted"],resolution_terms:["confirm delivery","post goods receipt","check warehouse","verify delivery"],linked_document:po.document_number}});
    else if(received<ordered)candidates.push({user_id:userId,incident_type:"partial_receipt",title:"Purchase order is only partially received",description:`PO ${po.document_number} still has open quantity. Investigate the receipts and explain the remaining business action.`,priority:"normal",source_document_number:po.document_number,expected_resolution:{root_cause_terms:["partial receipt","partial delivery","open quantity","remaining quantity"],resolution_terms:["confirm remaining delivery","post remaining goods receipt","follow up supplier","close remaining quantity"],ordered_quantity:ordered,received_quantity:received}});
  }
  for(const row of candidates){try{await supabaseRest("work_lab_incidents?on_conflict=user_id,incident_type,source_document_number",{method:"POST",headers:{Prefer:"resolution=ignore-duplicates,return=minimal"},body:JSON.stringify(row)},token);}catch{/* duplicate-safe */}}
}

export async function GET(request:Request){
  const ctx=await getContext(request);if(!ctx)return NextResponse.json({error:"Authentication required"},{status:401});if(!ctx.unlocked)return NextResponse.json({error:"Work Lab locked"},{status:403});
  await ensureIncidents(ctx.user.id,ctx.token);
  const incidents=await supabaseRest<Incident[]>(`work_lab_incidents?user_id=eq.${ctx.user.id}&select=id,incident_type,title,description,priority,source_document_number,status,created_at&order=created_at.desc`,{},ctx.token);
  const attempts=await supabaseRest<Attempt[]>(`work_lab_incident_attempts?user_id=eq.${ctx.user.id}&select=id,incident_id,score,ai_help_count,result,created_at&order=created_at.desc`,{},ctx.token);
  return NextResponse.json({incidents,attempts});
}

export async function POST(request:Request){
  const ctx=await getContext(request);if(!ctx)return NextResponse.json({error:"Authentication required"},{status:401});if(!ctx.unlocked)return NextResponse.json({error:"Work Lab locked"},{status:403});
  const body=await request.json() as {incidentId?:string;rootCause?:string;resolution?:string;aiHelpCount?:number};if(!body.incidentId)return NextResponse.json({error:"incidentId is required"},{status:400});
  const incidents=await supabaseRest<Array<Incident&{expected_resolution:Record<string,unknown>}>>(`work_lab_incidents?id=eq.${body.incidentId}&user_id=eq.${ctx.user.id}&select=id,incident_type,title,description,priority,source_document_number,status,created_at,expected_resolution&limit=1`,{},ctx.token);
  const incident=incidents[0];if(!incident)return NextResponse.json({error:"Incident not found"},{status:404});
  const root=normalizeText(body.rootCause??"");const resolution=normalizeText(body.resolution??"");const rootTerms=(incident.expected_resolution.root_cause_terms as string[]|undefined)??[];const resolutionTerms=(incident.expected_resolution.resolution_terms as string[]|undefined)??[];
  const rootScore=includesAny(root,rootTerms)?50:root.length>=20?25:0;const resolutionScore=includesAny(resolution,resolutionTerms)?50:resolution.length>=20?25:0;const score=rootScore+resolutionScore;const passed=score>=80;const result=passed?"pass":score>0?"partial":"fail";
  await supabaseRest("work_lab_incident_attempts",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({incident_id:incident.id,user_id:ctx.user.id,submitted_root_cause:body.rootCause??"",submitted_resolution:body.resolution??"",score,ai_help_count:Math.max(0,body.aiHelpCount??0),result})},ctx.token);
  if(passed)await supabaseRest(`work_lab_incidents?id=eq.${incident.id}&user_id=eq.${ctx.user.id}`,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({status:"resolved",resolved_at:new Date().toISOString()})},ctx.token);
  return NextResponse.json({passed,score,result,independenceScore:Math.max(0,100-Math.min(100,(body.aiHelpCount??0)*20)),feedback:passed?"Incident resolved. Your diagnosis and corrective action are verified.":"Your investigation is incomplete. Re-open the linked documents, identify the process break, and revise the resolution."});
}
