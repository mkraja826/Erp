import { NextResponse } from "next/server";
import { getSupabaseUser, supabaseRest } from "../../../../lib/supabase";

type ErpDocument={id:string;document_number:string;document_type:string;status:string;header:Record<string,unknown>;items:Array<Record<string,unknown>>};
type BalanceRow={quantity:number|string};
type Body={action?:"reverse_billing"|"reverse_goods_issue"|"cancel_delivery";data?:Record<string,unknown>};
function tokenOf(request:Request){const auth=request.headers.get("authorization");return auth?.startsWith("Bearer ")?auth.slice(7):undefined;}
async function findDoc(userId:string,token:string,doc:string,type:string){const rows=await supabaseRest<ErpDocument[]>(`erp_documents?user_id=eq.${userId}&document_number=eq.${encodeURIComponent(doc)}&document_type=eq.${type}&select=id,document_number,document_type,status,header,items&limit=1`,{},token);return rows[0]??null;}
async function dependent(userId:string,token:string,type:string,field:string,value:string){const rows=await supabaseRest<ErpDocument[]>(`erp_documents?user_id=eq.${userId}&document_type=eq.${type}&header->>${field}=eq.${encodeURIComponent(value)}&status=neq.reversed&select=id,document_number,document_type,status,header,items&limit=1`,{},token);return rows[0]??null;}
async function patch(doc:ErpDocument,token:string,status:string,header:Record<string,unknown>){await supabaseRest(`erp_documents?id=eq.${doc.id}`,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({status,header})},token);}
async function balance(userId:string,token:string,material:string,plant:string,storage:string){const rows=await supabaseRest<BalanceRow[]>(`erp_inventory_balances?user_id=eq.${userId}&material_code=eq.${encodeURIComponent(material)}&plant_code=eq.${encodeURIComponent(plant)}&storage_location_code=eq.${encodeURIComponent(storage)}&select=quantity&limit=1`,{},token);return Number(rows[0]?.quantity??0);}
async function setBalance(userId:string,token:string,material:string,plant:string,storage:string,quantity:number){await supabaseRest("erp_inventory_balances?on_conflict=user_id,material_code,plant_code,storage_location_code",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({user_id:userId,material_code:material,plant_code:plant,storage_location_code:storage,quantity,updated_at:new Date().toISOString()})},token);}

export async function POST(request:Request){
  const token=tokenOf(request);if(!token)return NextResponse.json({error:"Authentication required"},{status:401});
  const user=await getSupabaseUser(token);if(!user)return NextResponse.json({error:"Invalid session"},{status:401});
  const body=await request.json() as Body;const data=body.data??{};
  try{
    if(body.action==="reverse_billing"){
      const billingNumber=String(data.billing??"").trim();const bill=await findDoc(user.id,token,billingNumber,"BILL");if(!bill)return NextResponse.json({error:"Billing document not found."},{status:404});if(bill.status!=="posted")return NextResponse.json({error:`Billing document ${bill.document_number} is ${bill.status} and cannot be reversed.`},{status:409});
      const fi=await dependent(user.id,token,"FI","source_document",bill.document_number);if(fi)return NextResponse.json({error:`Reverse FI document ${fi.document_number} before reversing billing ${bill.document_number}.`},{status:409});
      await patch(bill,token,"reversed",{...bill.header,reversal_date:new Date().toISOString().slice(0,10)});const so=await findDoc(user.id,token,String(bill.header.sales_order??""),"SO");if(so)await patch(so,token,"delivered",{...so.header,billing_document:null});
      return NextResponse.json({reversed:true,documentNumber:bill.document_number,status:"reversed",salesOrder:bill.header.sales_order});
    }
    if(body.action==="reverse_goods_issue"){
      const deliveryNumber=String(data.delivery??"").trim();const delivery=await findDoc(user.id,token,deliveryNumber,"DLV");if(!delivery)return NextResponse.json({error:"Delivery not found."},{status:404});if(delivery.status!=="goods_issued")return NextResponse.json({error:`Delivery ${delivery.document_number} is ${delivery.status} and goods issue cannot be reversed.`},{status:409});
      const bill=await dependent(user.id,token,"BILL","delivery",delivery.document_number);if(bill)return NextResponse.json({error:`Reverse billing document ${bill.document_number} before reversing goods issue for ${delivery.document_number}.`},{status:409});
      const item=delivery.items[0]??{},material=String(item.material??""),qty=Number(item.delivery_quantity??0),plant=String(delivery.header.plant??""),storage=String(delivery.header.storage_location??"");const before=await balance(user.id,token,material,plant,storage),after=before+qty;await setBalance(user.id,token,material,plant,storage,after);await patch(delivery,token,"open",{...delivery.header,goods_issue_reversal_date:new Date().toISOString().slice(0,10),reversal_movement_type:"602",inventory_after_reversal:after});const so=await findDoc(user.id,token,String(delivery.header.sales_order??""),"SO");if(so)await patch(so,token,"delivery_created",so.header);
      return NextResponse.json({reversed:true,documentNumber:delivery.document_number,status:"open",reversalMovementType:"602",inventoryBefore:before,inventoryAfter:after});
    }
    if(body.action==="cancel_delivery"){
      const deliveryNumber=String(data.delivery??"").trim();const delivery=await findDoc(user.id,token,deliveryNumber,"DLV");if(!delivery)return NextResponse.json({error:"Delivery not found."},{status:404});if(delivery.status!=="open")return NextResponse.json({error:`Delivery ${delivery.document_number} is ${delivery.status}. Reverse goods issue before cancelling the delivery.`},{status:409});
      const bill=await dependent(user.id,token,"BILL","delivery",delivery.document_number);if(bill)return NextResponse.json({error:`Reverse billing document ${bill.document_number} before cancelling delivery ${delivery.document_number}.`},{status:409});await patch(delivery,token,"reversed",{...delivery.header,cancellation_date:new Date().toISOString().slice(0,10)});const so=await findDoc(user.id,token,String(delivery.header.sales_order??""),"SO");if(so)await patch(so,token,"open",{...so.header,delivery_document:null,billing_document:null});
      return NextResponse.json({reversed:true,documentNumber:delivery.document_number,status:"reversed",salesOrder:delivery.header.sales_order,salesOrderStatus:"open"});
    }
    return NextResponse.json({error:"Unsupported sales dependency action."},{status:400});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Unable to process O2C dependency reversal."},{status:500});}
}
