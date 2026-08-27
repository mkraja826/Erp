import { NextResponse } from "next/server";
import { getSupabaseUser, supabaseRest } from "../../../../lib/supabase";

type Doc={id:string;document_number:string;document_type:string;status:string;header:Record<string,unknown>;items:Array<Record<string,unknown>>;created_at:string};

function tokenFrom(request:Request){const auth=request.headers.get("authorization");return auth?.startsWith("Bearer ")?auth.slice(7):undefined;}

export async function GET(request:Request,{params}:{params:Promise<{number:string}>}){
  const token=tokenFrom(request);if(!token)return NextResponse.json({error:"Authentication required"},{status:401});
  const user=await getSupabaseUser(token);if(!user)return NextResponse.json({error:"Invalid session"},{status:401});
  const {number}=await params;const decoded=decodeURIComponent(number);
  const rows=await supabaseRest<Doc[]>(`erp_documents?user_id=eq.${user.id}&document_number=eq.${encodeURIComponent(decoded)}&select=id,document_number,document_type,status,header,items,created_at&limit=1`,{},token);
  const document=rows[0];if(!document)return NextResponse.json({error:"Document not found"},{status:404});
  const all=await supabaseRest<Doc[]>(`erp_documents?user_id=eq.${user.id}&select=id,document_number,document_type,status,header,items,created_at&order=created_at.asc`,{},token);
  const links:Doc[]=[];
  if(document.document_type==="PR") links.push(...all.filter(d=>d.document_type==="PO"&&String(d.header.source_pr??"")===document.document_number));
  if(document.document_type==="PO"){
    const source=String(document.header.source_pr??"");if(source){const pr=all.find(d=>d.document_number===source);if(pr)links.push(pr);}
    links.push(...all.filter(d=>(d.document_type==="GR"||d.document_type==="IV")&&String(d.header.source_po??"")===document.document_number));
  }
  if(document.document_type==="GR"||document.document_type==="IV"){
    const source=String(document.header.source_po??"");if(source){const po=all.find(d=>d.document_number===source);if(po)links.push(po);}
  }
  const unique=Array.from(new Map(links.map(d=>[d.document_number,d])).values());
  return NextResponse.json({document,linkedDocuments:unique});
}
