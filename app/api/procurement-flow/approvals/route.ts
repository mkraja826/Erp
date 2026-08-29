import { NextResponse } from "next/server";
import { getSupabaseUser, supabaseRest } from "../../../../lib/supabase";

type ErpDocument={id:string;document_number:string;document_type:string;status:string;header:Record<string,unknown>;items:Array<Record<string,unknown>>;created_at:string};
type Body={action?:"submit"|"approve"|"reject";data?:{document_number?:string;acting_role?:string;comment?:string}};

function tokenOf(request:Request){const auth=request.headers.get("authorization");return auth?.startsWith("Bearer ")?auth.slice(7):undefined;}
async function findDoc(userId:string,token:string,number:string){const rows=await supabaseRest<ErpDocument[]>(`erp_documents?user_id=eq.${userId}&document_number=eq.${encodeURIComponent(number)}&document_type=in.(PR,PO)&select=id,document_number,document_type,status,header,items,created_at&limit=1`,{},token);return rows[0]??null;}
function approvalRole(type:string){return type==="PR"?"department_manager":"purchasing_manager";}
function releaseStatus(doc:ErpDocument){return String(doc.header.release_status??"draft");}

export async function GET(request:Request){
  const token=tokenOf(request);if(!token)return NextResponse.json({error:"Authentication required"},{status:401});
  const user=await getSupabaseUser(token);if(!user)return NextResponse.json({error:"Invalid session"},{status:401});
  const rows=await supabaseRest<ErpDocument[]>(`erp_documents?user_id=eq.${user.id}&document_type=in.(PR,PO)&select=id,document_number,document_type,status,header,items,created_at&order=created_at.desc&limit=50`,{},token);
  return NextResponse.json({documents:rows.map(doc=>({documentNumber:doc.document_number,documentType:doc.document_type,operationalStatus:doc.status,releaseStatus:releaseStatus(doc),requiredRole:approvalRole(doc.document_type),releaseHistory:Array.isArray(doc.header.release_history)?doc.header.release_history:[],createdAt:doc.created_at,itemCount:doc.items?.length??0}))});
}

export async function POST(request:Request){
  const token=tokenOf(request);if(!token)return NextResponse.json({error:"Authentication required"},{status:401});
  const user=await getSupabaseUser(token);if(!user)return NextResponse.json({error:"Invalid session"},{status:401});
  const body=await request.json() as Body;const data=body.data??{};const number=String(data.document_number??"").trim();const role=String(data.acting_role??"").trim();const comment=String(data.comment??"").trim();
  const doc=await findDoc(user.id,token,number);if(!doc)return NextResponse.json({error:"Choose a PR or PO that belongs to your account."},{status:400});
  const current=releaseStatus(doc);const required=approvalRole(doc.document_type);const history=Array.isArray(doc.header.release_history)?[...doc.header.release_history] as Record<string,unknown>[]:[];
  const stamp={at:new Date().toISOString(),action:body.action,acting_role:role,comment};
  let next=current;
  if(body.action==="submit"){
    if(!["draft","rejected"].includes(current))return NextResponse.json({error:`${doc.document_number} is ${current} and cannot be submitted again.`},{status:409});
    if(role!=="requester"&&role!=="buyer")return NextResponse.json({error:"Submit using requester for PR or buyer for PO."},{status:403});
    next="pending_approval";
  }else if(body.action==="approve"){
    if(current!=="pending_approval")return NextResponse.json({error:`${doc.document_number} must be pending approval before release.`},{status:409});
    if(role!==required)return NextResponse.json({error:`${doc.document_type} release requires role ${required}.`},{status:403});
    next="released";
  }else if(body.action==="reject"){
    if(current!=="pending_approval")return NextResponse.json({error:`${doc.document_number} must be pending approval before rejection.`},{status:409});
    if(role!==required)return NextResponse.json({error:`${doc.document_type} rejection requires role ${required}.`},{status:403});
    if(!comment)return NextResponse.json({error:"A rejection comment is required."},{status:400});
    next="rejected";
  }else return NextResponse.json({error:"Unsupported approval action."},{status:400});
  history.push(stamp);
  const header={...doc.header,release_status:next,required_approval_role:required,release_history:history,released_at:next==="released"?new Date().toISOString():doc.header.released_at??null,released_by_role:next==="released"?role:doc.header.released_by_role??null};
  await supabaseRest(`erp_documents?id=eq.${doc.id}`,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({header})},token);
  return NextResponse.json({documentNumber:doc.document_number,documentType:doc.document_type,operationalStatus:doc.status,releaseStatus:next,requiredRole:required,history});
}
