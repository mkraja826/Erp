import { NextResponse } from "next/server";
import { getSupabaseUser, supabaseRest } from "../../../lib/supabase";

type MasterRow={entity_type:string;code:string;name:string;attributes:Record<string,unknown>};
type DocumentRow={document_number:string;document_type:string;status:string;created_at:string;header:Record<string,unknown>;items:unknown[]};
type InventoryRow={quantity:number|string};

const transactions=[
  {code:"MM-PR",name:"Create Purchase Requisition",area:"Purchasing"},
  {code:"MM-PO",name:"Create Purchase Order",area:"Purchasing"},
  {code:"MM-GR",name:"Post Goods Receipt",area:"Inventory"},
  {code:"MM-IV",name:"Verify Supplier Invoice",area:"Invoice"},
  {code:"MM-ST",name:"Transfer Stock",area:"Inventory"},
];

async function setBalance(token:string,userId:string,material:string,plant:string,storage:string,delta:number){
  const params=new URLSearchParams({user_id:`eq.${userId}`,material_code:`eq.${material}`,plant_code:`eq.${plant}`,storage_location_code:`eq.${storage}`,select:"quantity",limit:"1"});
  const rows=await supabaseRest<InventoryRow[]>(`erp_inventory_balances?${params.toString()}`,{},token);
  const next=Number(rows[0]?.quantity??0)+delta;
  await supabaseRest("erp_inventory_balances?on_conflict=user_id,material_code,plant_code,storage_location_code",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({user_id:userId,material_code:material,plant_code:plant,storage_location_code:storage,quantity:next,updated_at:new Date().toISOString()})},token);
  return next;
}

export async function GET(request:Request){
  const auth=request.headers.get("authorization");const token=auth?.startsWith("Bearer ")?auth.slice(7):undefined;
  if(!token)return NextResponse.json({error:"Authentication required"},{status:401});
  const user=await getSupabaseUser(token);if(!user)return NextResponse.json({error:"Invalid session"},{status:401});
  const url=new URL(request.url);const q=(url.searchParams.get("q")??"").toLowerCase();
  const master=await supabaseRest<MasterRow[]>("erp_master_data?is_active=eq.true&select=entity_type,code,name,attributes&order=entity_type.asc,code.asc",{},token);
  const documents=await supabaseRest<DocumentRow[]>(`erp_documents?user_id=eq.${user.id}&select=document_number,document_type,status,created_at,header,items&order=created_at.desc&limit=20`,{},token);
  const inventory=await supabaseRest(`erp_inventory_balances?user_id=eq.${user.id}&select=material_code,plant_code,storage_location_code,quantity&order=updated_at.desc`,{},token);
  return NextResponse.json({transactions:q?transactions.filter(t=>`${t.code} ${t.name} ${t.area}`.toLowerCase().includes(q)):transactions,masterData:master,documents,inventory});
}

export async function POST(request:Request){
  const auth=request.headers.get("authorization");const token=auth?.startsWith("Bearer ")?auth.slice(7):undefined;
  if(!token)return NextResponse.json({error:"Authentication required"},{status:401});
  const user=await getSupabaseUser(token);if(!user)return NextResponse.json({error:"Invalid session"},{status:401});
  const body=await request.json() as {documentType?:string;header?:Record<string,unknown>;items?:unknown[];sourceExerciseId?:string;sourceWorkTaskId?:string};
  if(!body.documentType)return NextResponse.json({error:"documentType is required"},{status:400});
  const prefix=body.documentType.toUpperCase().replace(/[^A-Z]/g,"").slice(0,4)||"DOC";const documentNumber=`${prefix}-${Date.now().toString().slice(-9)}`;const header=body.header??{};
  await supabaseRest("erp_documents",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({user_id:user.id,document_type:body.documentType,document_number:documentNumber,status:"posted",header,items:body.items??[],source_exercise_id:body.sourceExerciseId??null,source_work_task_id:body.sourceWorkTaskId??null})},token);
  const inventoryChanges:Record<string,number>={};
  if(body.documentType==="MM-GR"){
    const material=String(header.material??"");const plant=String(header.plant??"");const quantity=Number(header.received_quantity??header.quantity??0);
    if(material&&plant&&quantity>0)inventoryChanges[`${material}@${plant}`]=await setBalance(token,user.id,material,plant,"__PLANT__",quantity);
  }
  if(body.documentType==="MM-ST"){
    const material=String(header.material??"MAT-101");const plant=String(header.plant??"HYD1");const qty=Number(header.quantity??0);const from=String(header.from_storage_location??"");const to=String(header.to_storage_location??"");
    if(qty>0&&from&&to){inventoryChanges[`${material}@${from}`]=await setBalance(token,user.id,material,plant,from,-qty);inventoryChanges[`${material}@${to}`]=await setBalance(token,user.id,material,plant,to,qty);}
  }
  return NextResponse.json({posted:true,documentNumber,inventoryChanges});
}
