import { NextResponse } from "next/server";
import { getSupabaseUser, supabaseRest } from "../../../lib/supabase";

type MasterRow={entity_type:string;code:string;name:string;attributes:Record<string,unknown>};
type DocumentRow={document_number:string;document_type:string;status:string;created_at:string;header:Record<string,unknown>;items:unknown[]};

const transactions=[
  {code:"MM-PR",name:"Create Purchase Requisition",area:"Purchasing"},
  {code:"MM-PO",name:"Create Purchase Order",area:"Purchasing"},
  {code:"MM-GR",name:"Post Goods Receipt",area:"Inventory"},
  {code:"MM-IV",name:"Verify Supplier Invoice",area:"Invoice"},
  {code:"MM-ST",name:"Transfer Stock",area:"Inventory"},
];

export async function GET(request:Request){
  const auth=request.headers.get("authorization");
  const token=auth?.startsWith("Bearer ")?auth.slice(7):undefined;
  if(!token)return NextResponse.json({error:"Authentication required"},{status:401});
  const user=await getSupabaseUser(token);if(!user)return NextResponse.json({error:"Invalid session"},{status:401});
  const url=new URL(request.url);const q=(url.searchParams.get("q")??"").toLowerCase();
  const master=await supabaseRest<MasterRow[]>("erp_master_data?is_active=eq.true&select=entity_type,code,name,attributes&order=entity_type.asc,code.asc",{},token);
  const documents=await supabaseRest<DocumentRow[]>(`erp_documents?user_id=eq.${user.id}&select=document_number,document_type,status,created_at,header,items&order=created_at.desc&limit=20`,{},token);
  return NextResponse.json({transactions:q?transactions.filter(t=>`${t.code} ${t.name} ${t.area}`.toLowerCase().includes(q)):transactions,masterData:master,documents});
}

export async function POST(request:Request){
  const auth=request.headers.get("authorization");const token=auth?.startsWith("Bearer ")?auth.slice(7):undefined;
  if(!token)return NextResponse.json({error:"Authentication required"},{status:401});
  const user=await getSupabaseUser(token);if(!user)return NextResponse.json({error:"Invalid session"},{status:401});
  const body=await request.json() as {documentType?:string;header?:Record<string,unknown>;items?:unknown[];sourceExerciseId?:string;sourceWorkTaskId?:string};
  if(!body.documentType)return NextResponse.json({error:"documentType is required"},{status:400});
  const prefix=body.documentType.toUpperCase().replace(/[^A-Z]/g,"").slice(0,3)||"DOC";
  const documentNumber=`${prefix}-${Date.now().toString().slice(-9)}`;
  await supabaseRest("erp_documents",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({user_id:user.id,document_type:body.documentType,document_number:documentNumber,status:"posted",header:body.header??{},items:body.items??[],source_exercise_id:body.sourceExerciseId??null,source_work_task_id:body.sourceWorkTaskId??null})},token);
  return NextResponse.json({posted:true,documentNumber});
}
