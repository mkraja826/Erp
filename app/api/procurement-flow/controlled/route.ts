import { NextResponse } from "next/server";
import { getSupabaseUser, supabaseRest } from "../../../../lib/supabase";

type ErpDocument={id:string;document_number:string;document_type:string;status:string;header:Record<string,unknown>;items:Array<Record<string,unknown>>};
type Body={action?:string;data?:Record<string,unknown>};
function tokenOf(request:Request){const auth=request.headers.get("authorization");return auth?.startsWith("Bearer ")?auth.slice(7):undefined;}
async function findDoc(userId:string,token:string,number:string,type:string){const rows=await supabaseRest<ErpDocument[]>(`erp_documents?user_id=eq.${userId}&document_number=eq.${encodeURIComponent(number)}&document_type=eq.${type}&select=id,document_number,document_type,status,header,items&limit=1`,{},token);return rows[0]??null;}
function released(doc:ErpDocument){return String(doc.header.release_status??"draft")==="released";}

export async function POST(request:Request){
  const token=tokenOf(request);if(!token)return NextResponse.json({error:"Authentication required"},{status:401});
  const user=await getSupabaseUser(token);if(!user)return NextResponse.json({error:"Invalid session"},{status:401});
  const body=await request.json() as Body;const data=body.data??{};
  if(body.action==="create_po"){
    const number=String(data.source_pr??"").trim();const pr=await findDoc(user.id,token,number,"PR");
    if(!pr)return NextResponse.json({error:"Choose a purchase requisition that belongs to your account."},{status:400});
    if(!released(pr))return NextResponse.json({error:`Purchase requisition ${pr.document_number} must be released before PO conversion.`},{status:409});
  }
  if(body.action==="post_gr"){
    const number=String(data.source_po??"").trim();const po=await findDoc(user.id,token,number,"PO");
    if(!po)return NextResponse.json({error:"Choose a purchase order that belongs to your account."},{status:400});
    if(!released(po))return NextResponse.json({error:`Purchase order ${po.document_number} must be released before goods receipt.`},{status:409});
  }
  const upstream=new URL("/api/procurement-flow/multiline",request.url);
  const response=await fetch(upstream,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},body:JSON.stringify(body)});
  const text=await response.text();return new NextResponse(text,{status:response.status,headers:{"Content-Type":response.headers.get("content-type")??"application/json"}});
}
