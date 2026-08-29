import { NextResponse } from "next/server";
import { getSupabaseUser, supabaseRest } from "../../../lib/supabase";

type ErpDocument={id:string;document_number:string;document_type:string;status:string;header:Record<string,unknown>;items:Array<Record<string,unknown>>;created_at:string};
type MasterRow={entity_type:string;code:string;name:string;attributes:Record<string,unknown>|null;is_active:boolean};
type BalanceRow={quantity:number|string};
type Body={action?:"create_sales_order"|"create_delivery"|"post_goods_issue"|"create_billing"|"post_receivable";data?:Record<string,unknown>};
function tokenOf(request:Request){const auth=request.headers.get("authorization");return auth?.startsWith("Bearer ")?auth.slice(7):undefined;}
function number(prefix:string){return `${prefix}-${Date.now().toString().slice(-9)}`;}
async function findDoc(userId:string,token:string,doc:string,type:string){const rows=await supabaseRest<ErpDocument[]>(`erp_documents?user_id=eq.${userId}&document_number=eq.${encodeURIComponent(doc)}&document_type=eq.${type}&select=id,document_number,document_type,status,header,items,created_at&limit=1`,{},token);return rows[0]??null;}
async function patch(doc:ErpDocument,token:string,status:string,header?:Record<string,unknown>){await supabaseRest(`erp_documents?id=eq.${doc.id}`,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({status,header:header??doc.header})},token);}
async function master(type:string,code:string,token:string){const rows=await supabaseRest<MasterRow[]>(`erp_master_data?entity_type=eq.${encodeURIComponent(type)}&code=eq.${encodeURIComponent(code)}&is_active=eq.true&select=entity_type,code,name,attributes,is_active&limit=1`,{},token);return rows[0]??null;}
async function balance(userId:string,token:string,material:string,plant:string,storage:string){const rows=await supabaseRest<BalanceRow[]>(`erp_inventory_balances?user_id=eq.${userId}&material_code=eq.${encodeURIComponent(material)}&plant_code=eq.${encodeURIComponent(plant)}&storage_location_code=eq.${encodeURIComponent(storage)}&select=quantity&limit=1`,{},token);return Number(rows[0]?.quantity??0);}
async function setBalance(userId:string,token:string,material:string,plant:string,storage:string,quantity:number){await supabaseRest("erp_inventory_balances?on_conflict=user_id,material_code,plant_code,storage_location_code",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({user_id:userId,material_code:material,plant_code:plant,storage_location_code:storage,quantity,updated_at:new Date().toISOString()})},token);}
async function existing(userId:string,token:string,type:string,field:string,value:string){const rows=await supabaseRest<ErpDocument[]>(`erp_documents?user_id=eq.${userId}&document_type=eq.${type}&header->>${field}=eq.${encodeURIComponent(value)}&status=neq.reversed&select=id,document_number,document_type,status,header,items,created_at&limit=1`,{},token);return rows[0]??null;}

export async function POST(request:Request){
  const token=tokenOf(request);if(!token)return NextResponse.json({error:"Authentication required"},{status:401});
  const user=await getSupabaseUser(token);if(!user)return NextResponse.json({error:"Invalid session"},{status:401});
  const body=await request.json() as Body;const data=body.data??{};
  try{
    if(body.action==="create_sales_order"){
      const customer=String(data.customer??"").trim(),plant=String(data.plant??"").trim(),material=String(data.material??"").trim(),quantity=Number(data.quantity??0),unitPrice=Number(data.unit_price??0),currency=String(data.currency??"INR").trim()||"INR";
      if(!customer||!plant||!material||quantity<=0||unitPrice<=0)return NextResponse.json({error:"Customer, plant, material, quantity and unit price are required."},{status:400});
      if(!(await master("plant",plant,token))||!(await master("material",material,token)))return NextResponse.json({error:"Plant or material is not an active ERP master-data value."},{status:400});
      const doc=number("SO");const net=Number((quantity*unitPrice).toFixed(2));
      await supabaseRest("erp_documents",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({user_id:user.id,document_type:"SO",document_number:doc,status:"open",header:{customer,plant,currency,net_value:net,sales_phase:"SD"},items:[{line_number:10,material,quantity,unit_price:unitPrice,net_value:net}]})},token);
      return NextResponse.json({posted:true,documentNumber:doc,status:"open",customer,netValue:net,currency,next:"create_delivery"});
    }
    if(body.action==="create_delivery"){
      const salesOrder=String(data.sales_order??"").trim(),storage=String(data.storage_location??"").trim();const so=await findDoc(user.id,token,salesOrder,"SO");if(!so)return NextResponse.json({error:"Sales order not found."},{status:404});if(so.status!=="open")return NextResponse.json({error:`Sales order ${so.document_number} is ${so.status} and cannot create another delivery.`},{status:409});
      if(!storage||!(await master("storage_location",storage,token)))return NextResponse.json({error:"Choose an active storage location."},{status:400});
      const item=so.items[0]??{},material=String(item.material??""),qty=Number(item.quantity??0),plant=String(so.header.plant??"");const available=await balance(user.id,token,material,plant,storage);if(available<qty)return NextResponse.json({error:`Insufficient stock. Required ${qty}, available ${available}.`},{status:409});
      const doc=number("DLV");await supabaseRest("erp_documents",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({user_id:user.id,document_type:"DLV",document_number:doc,status:"open",header:{sales_order:so.document_number,customer:so.header.customer,plant,storage_location:storage,delivery_phase:"SD"},items:[{line_number:10,material,delivery_quantity:qty}]})},token);await patch(so,token,"delivery_created",{...so.header,delivery_document:doc});
      return NextResponse.json({posted:true,documentNumber:doc,status:"open",salesOrder:so.document_number,availableStock:available,next:"post_goods_issue"});
    }
    if(body.action==="post_goods_issue"){
      const deliveryNumber=String(data.delivery??"").trim();const delivery=await findDoc(user.id,token,deliveryNumber,"DLV");if(!delivery)return NextResponse.json({error:"Delivery not found."},{status:404});if(delivery.status!=="open")return NextResponse.json({error:`Delivery ${delivery.document_number} is ${delivery.status} and cannot post goods issue again.`},{status:409});
      const item=delivery.items[0]??{},material=String(item.material??""),qty=Number(item.delivery_quantity??0),plant=String(delivery.header.plant??""),storage=String(delivery.header.storage_location??"");const before=await balance(user.id,token,material,plant,storage);if(before<qty)return NextResponse.json({error:"Inventory balance is lower than delivery quantity."},{status:409});const after=before-qty;await setBalance(user.id,token,material,plant,storage,after);await patch(delivery,token,"goods_issued",{...delivery.header,goods_issue_date:new Date().toISOString().slice(0,10),movement_type:"601",inventory_before:before,inventory_after:after});
      const so=await findDoc(user.id,token,String(delivery.header.sales_order??""),"SO");if(so)await patch(so,token,"delivered",so.header);
      return NextResponse.json({posted:true,documentNumber:delivery.document_number,status:"goods_issued",movementType:"601",inventoryBefore:before,inventoryAfter:after,next:"create_billing"});
    }
    if(body.action==="create_billing"){
      const deliveryNumber=String(data.delivery??"").trim();const delivery=await findDoc(user.id,token,deliveryNumber,"DLV");if(!delivery)return NextResponse.json({error:"Delivery not found."},{status:404});if(delivery.status!=="goods_issued")return NextResponse.json({error:"Billing requires a goods-issued delivery."},{status:409});const duplicate=await existing(user.id,token,"BILL","delivery",delivery.document_number);if(duplicate)return NextResponse.json({error:`Billing document ${duplicate.document_number} already exists for this delivery.`},{status:409});
      const so=await findDoc(user.id,token,String(delivery.header.sales_order??""),"SO");if(!so)return NextResponse.json({error:"Source sales order not found."},{status:400});const gross=Number(so.header.net_value??0);const doc=number("BIL");await supabaseRest("erp_documents",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({user_id:user.id,document_type:"BILL",document_number:doc,status:"posted",header:{delivery:delivery.document_number,sales_order:so.document_number,customer:so.header.customer,currency:so.header.currency??"INR",billing_value:gross,billing_date:new Date().toISOString().slice(0,10),sales_phase:"SD-FI"},items:so.items})},token);await patch(so,token,"billed",{...so.header,billing_document:doc});
      return NextResponse.json({posted:true,documentNumber:doc,status:"posted",billingValue:gross,currency:so.header.currency??"INR",next:"post_receivable"});
    }
    if(body.action==="post_receivable"){
      const billingNumber=String(data.billing??"").trim();const bill=await findDoc(user.id,token,billingNumber,"BILL");if(!bill)return NextResponse.json({error:"Billing document not found."},{status:404});if(bill.status!=="posted")return NextResponse.json({error:"Only posted billing documents create receivables."},{status:409});const duplicate=await existing(user.id,token,"FI","source_document",bill.document_number);if(duplicate)return NextResponse.json({posted:true,duplicate:true,documentNumber:duplicate.document_number,status:duplicate.status,sourceDocument:bill.document_number,items:duplicate.items});
      const value=Number(bill.header.billing_value??0),doc=number("FI");const items=[{account:"120000",account_name:"Customer receivable",debit:value,credit:0,text:`Customer billing ${bill.document_number}`},{account:"400000",account_name:"Sales revenue",debit:0,credit:value,text:`Revenue ${bill.document_number}`}];await supabaseRest("erp_documents",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({user_id:user.id,document_type:"FI",document_number:doc,status:"posted",header:{source_document:bill.document_number,source_type:"BILL",customer:bill.header.customer,currency:bill.header.currency??"INR",total_debit:value,total_credit:value,balanced:true,clearing_status:"open",open_customer_amount:value,accounting_phase:"SD-FI"},items})},token);
      return NextResponse.json({posted:true,documentNumber:doc,status:"posted",sourceDocument:bill.document_number,customer:bill.header.customer,receivable:value,clearingStatus:"open",balanced:true,items});
    }
    return NextResponse.json({error:"Unsupported sales action."},{status:400});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Unable to process sales flow."},{status:500});}
}
