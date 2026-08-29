import { NextResponse } from "next/server";
import { getSupabaseUser, supabaseRest } from "../../../../lib/supabase";

type ErpDocument={document_number:string;document_type:string;status:string;header:Record<string,unknown>};
type Body={action?:string;data?:Record<string,unknown>};
function tokenOf(request:Request){const auth=request.headers.get("authorization");return auth?.startsWith("Bearer ")?auth.slice(7):undefined;}
async function docs(userId:string,token:string,query:string){return supabaseRest<ErpDocument[]>(`erp_documents?user_id=eq.${userId}&${query}&select=document_number,document_type,status,header`,{},token);}

export async function POST(request:Request){
  const token=tokenOf(request);if(!token)return NextResponse.json({error:"Authentication required"},{status:401});
  const user=await getSupabaseUser(token);if(!user)return NextResponse.json({error:"Invalid session"},{status:401});
  const body=await request.json() as Body;const data=body.data??{};
  if(body.action==="reverse_invoice"){
    const invoice=String(data.source_invoice??"").trim();
    const activeFi=await docs(user.id,token,`document_type=eq.FI&status=neq.reversed&header->>source_document=eq.${encodeURIComponent(invoice)}`);
    if(activeFi.length>0)return NextResponse.json({error:`Reverse FI document ${activeFi[0].document_number} before reversing invoice ${invoice}.`},{status:409});
  }
  if(body.action==="reverse_gr"){
    const gr=String(data.source_gr??"").trim();
    const activeFi=await docs(user.id,token,`document_type=eq.FI&status=neq.reversed&header->>source_document=eq.${encodeURIComponent(gr)}`);
    if(activeFi.length>0)return NextResponse.json({error:`Reverse FI document ${activeFi[0].document_number} before reversing goods receipt ${gr}.`},{status:409});
  }
  const upstream=new URL("/api/procurement-flow/multiline",request.url);
  const response=await fetch(upstream,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},body:JSON.stringify(body)});
  const text=await response.text();return new NextResponse(text,{status:response.status,headers:{"Content-Type":response.headers.get("content-type")??"application/json"}});
}
