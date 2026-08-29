import { NextResponse } from "next/server";
import { getSupabaseUser, supabaseRest } from "../../../lib/supabase";

type ErpDocument={id:string;document_number:string;document_type:string;status:string;header:Record<string,unknown>;items:Array<Record<string,unknown>>;created_at:string};
type ActionBody={action?:"create_pr"|"create_po"|"post_gr"|"post_invoice";data?:Record<string,unknown>};
type BalanceRow={quantity:number};
type MasterRow={entity_type:string;code:string;name:string;attributes:Record<string,unknown>|null;is_active:boolean};

function authToken(request:Request){const auth=request.headers.get("authorization");return auth?.startsWith("Bearer ")?auth.slice(7):undefined;}
function docNumber(prefix:string){return `${prefix}-${Date.now().toString().slice(-9)}`;}
function isoDate(value:unknown){const raw=String(value??"").trim();return /^\d{4}-\d{2}-\d{2}$/.test(raw)?raw:new Date().toISOString().slice(0,10);}
async function documentsForUser(userId:string,token:string){return supabaseRest<ErpDocument[]>(`erp_documents?user_id=eq.${userId}&select=id,document_number,document_type,status,header,items,created_at&order=created_at.asc`,{},token);}
async function findOwnedDocument(userId:string,token:string,documentNumber:string,type:string){const rows=await supabaseRest<ErpDocument[]>(`erp_documents?user_id=eq.${userId}&document_number=eq.${encodeURIComponent(documentNumber)}&document_type=eq.${type}&select=id,document_number,document_type,status,header,items,created_at&limit=1`,{},token);return rows[0]??null;}
async function updateDocumentStatus(id:string,status:string,token:string){await supabaseRest(`erp_documents?id=eq.${id}`,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({status})},token);}
async function masterRow(entityType:string,code:string,token:string){const rows=await supabaseRest<MasterRow[]>(`erp_master_data?entity_type=eq.${encodeURIComponent(entityType)}&code=eq.${encodeURIComponent(code)}&is_active=eq.true&select=entity_type,code,name,attributes,is_active&limit=1`,{},token);return rows[0]??null;}
async function requireMaster(entityType:string,code:string,label:string,token:string){const row=await masterRow(entityType,code,token);if(!row)throw new Error(`${label} ${code} is not an active ERP master-data value.`);return row;}
function linkedPlant(row:MasterRow){const attrs=row.attributes??{};return String(attrs.plant_code??attrs.plant??"").trim();}

export async function GET(request:Request){const token=authToken(request);if(!token)return NextResponse.json({error:"Authentication required"},{status:401});const user=await getSupabaseUser(token);if(!user)return NextResponse.json({error:"Invalid session"},{status:401});const documents=await documentsForUser(user.id,token);return NextResponse.json({documents,stages:{requisition:documents.filter(d=>d.document_type==="PR"),purchaseOrders:documents.filter(d=>d.document_type==="PO"),goodsReceipts:documents.filter(d=>d.document_type==="GR"),invoices:documents.filter(d=>d.document_type==="IV")}});}

export async function POST(request:Request){
  const token=authToken(request);if(!token)return NextResponse.json({error:"Authentication required"},{status:401});
  const user=await getSupabaseUser(token);if(!user)return NextResponse.json({error:"Invalid session"},{status:401});
  const body=await request.json() as ActionBody;const data=body.data??{};
  try{
    if(body.action==="create_pr"){
      const material=String(data.material??"").trim(),plant=String(data.plant??"").trim(),quantity=Number(data.quantity??0);
      if(!material||!plant||quantity<=0)return NextResponse.json({error:"Material, plant and quantity are required."},{status:400});
      await Promise.all([requireMaster("material",material,"Material",token),requireMaster("plant",plant,"Plant",token)]);
      const number=docNumber("PR");
      await supabaseRest("erp_documents",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({user_id:user.id,document_type:"PR",document_number:number,status:"open",header:{plant},items:[{material,quantity}]})},token);
      return NextResponse.json({posted:true,documentNumber:number,status:"open",next:"create_po"});
    }

    if(body.action==="create_po"){
      const sourcePr=String(data.source_pr??"").trim(),vendor=String(data.vendor??"").trim(),purchasingOrganization=String(data.purchasing_organization??"").trim(),unitPrice=Number(data.unit_price??0);
      if(!sourcePr||!vendor||!purchasingOrganization||unitPrice<=0)return NextResponse.json({error:"Source PR, vendor, purchasing organization and unit price are required."},{status:400});
      await Promise.all([requireMaster("vendor",vendor,"Vendor",token),requireMaster("purchasing_organization",purchasingOrganization,"Purchasing organization",token)]);
      const pr=await findOwnedDocument(user.id,token,sourcePr,"PR");if(!pr)return NextResponse.json({error:"Choose a purchase requisition that belongs to your account."},{status:400});
      if(!["open","approved","posted"].includes(pr.status))return NextResponse.json({error:`Purchase requisition ${pr.document_number} is ${pr.status} and cannot be converted again.`},{status:400});
      const item=pr.items[0]??{};await Promise.all([requireMaster("material",String(item.material??""),"PR material",token),requireMaster("plant",String(pr.header.plant??""),"PR plant",token)]);
      const number=docNumber("PO");
      await supabaseRest("erp_documents",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({user_id:user.id,document_type:"PO",document_number:number,status:"open",header:{source_pr:pr.document_number,vendor,purchasing_organization:purchasingOrganization,plant:pr.header.plant},items:[{...item,unit_price:unitPrice}]})},token);
      await updateDocumentStatus(pr.id,"converted",token);
      return NextResponse.json({posted:true,documentNumber:number,status:"open",sourceDocument:pr.document_number,next:"post_gr"});
    }

    if(body.action==="post_gr"){
      const sourcePo=String(data.source_po??"").trim(),receivedQuantity=Number(data.received_quantity??0),storageLocation=String(data.storage_location??"SL01").trim()||"SL01";
      const postingDate=isoDate(data.posting_date),documentDate=isoDate(data.document_date),movementType=String(data.movement_type??"101").trim()||"101";
      if(!sourcePo||receivedQuantity<=0)return NextResponse.json({error:"Source PO and received quantity are required."},{status:400});
      if(movementType!=="101")return NextResponse.json({error:"Level 1 goods receipt supports movement type 101 only."},{status:400});
      if(documentDate>postingDate)return NextResponse.json({error:"Document date cannot be after posting date."},{status:400});
      const po=await findOwnedDocument(user.id,token,sourcePo,"PO");if(!po)return NextResponse.json({error:"Choose a purchase order that belongs to your account."},{status:400});
      if(po.status==="closed")return NextResponse.json({error:"This purchase order is closed and cannot receive more goods."},{status:400});
      const item=po.items[0]??{},plant=String(po.header.plant??""),material=String(item.material??"");
      const [materialRow,plantRow,storageRow]=await Promise.all([requireMaster("material",material,"PO material",token),requireMaster("plant",plant,"PO plant",token),requireMaster("storage_location",storageLocation,"Storage location",token)]);
      void materialRow;void plantRow;const storagePlant=linkedPlant(storageRow);if(storagePlant&&storagePlant!==plant)return NextResponse.json({error:`Storage location ${storageLocation} belongs to plant ${storagePlant}, not ${plant}.`},{status:400});
      const orderedQuantity=Number(item.quantity??0);if(receivedQuantity>orderedQuantity)return NextResponse.json({error:"Received quantity cannot exceed the PO quantity in this Level 1 simulator."},{status:400});
      const existing=await supabaseRest<ErpDocument[]>(`erp_documents?user_id=eq.${user.id}&document_type=eq.GR&header->>source_po=eq.${encodeURIComponent(sourcePo)}&select=id,items`,{},token);
      const alreadyReceived=existing.reduce((sum,row)=>sum+Number(row.items?.[0]?.received_quantity??0),0),openBefore=orderedQuantity-alreadyReceived;
      if(receivedQuantity>openBefore)return NextResponse.json({error:"This receipt would exceed the remaining open PO quantity."},{status:400});
      const totalReceived=alreadyReceived+receivedQuantity,openAfter=orderedQuantity-totalReceived,poStatus=openAfter===0?"fully_received":"partially_received";
      const number=docNumber("GR");
      await supabaseRest("erp_documents",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({user_id:user.id,document_type:"GR",document_number:number,status:"posted",header:{source_po:po.document_number,plant,storage_location:storageLocation,posting_date:postingDate,document_date:documentDate,movement_type:movementType,ordered_quantity:orderedQuantity,previously_received_quantity:alreadyReceived,open_quantity_before:openBefore,open_quantity_after:openAfter,po_receipt_status:poStatus},items:[{material,received_quantity:receivedQuantity}]})},token);
      await updateDocumentStatus(po.id,poStatus,token);
      const balances=await supabaseRest<BalanceRow[]>(`erp_inventory_balances?user_id=eq.${user.id}&material_code=eq.${encodeURIComponent(material)}&plant_code=eq.${encodeURIComponent(plant)}&storage_location_code=eq.${encodeURIComponent(storageLocation)}&select=quantity&limit=1`,{},token);
      const newBalance=Number(balances[0]?.quantity??0)+receivedQuantity;
      await supabaseRest("erp_inventory_balances?on_conflict=user_id,material_code,plant_code,storage_location_code",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({user_id:user.id,material_code:material,plant_code:plant,storage_location_code:storageLocation,quantity:newBalance,updated_at:new Date().toISOString()})},token);
      return NextResponse.json({posted:true,documentNumber:number,status:"posted",sourceDocument:po.document_number,poStatus,orderedQuantity,previouslyReceived:alreadyReceived,receivedQuantity,openQuantity:openAfter,postingDate,documentDate,movementType,inventoryBalance:newBalance,next:"post_invoice"});
    }

    if(body.action==="post_invoice"){
      const sourcePo=String(data.source_po??"").trim(),invoiceValue=Number(data.invoice_value??0),supplierInvoiceNumber=String(data.supplier_invoice_number??"").trim();
      const invoiceDate=isoDate(data.invoice_date),postingDate=isoDate(data.posting_date);
      if(!sourcePo||!supplierInvoiceNumber||invoiceValue<=0)return NextResponse.json({error:"Source PO, supplier invoice number and invoice value are required."},{status:400});
      if(invoiceDate>postingDate)return NextResponse.json({error:"Invoice date cannot be after posting date."},{status:400});
      const po=await findOwnedDocument(user.id,token,sourcePo,"PO");if(!po)return NextResponse.json({error:"Choose a purchase order that belongs to your account."},{status:400});
      if(po.status==="closed")return NextResponse.json({error:"This purchase order is already closed."},{status:400});
      const vendor=String(po.header.vendor??"");await requireMaster("vendor",vendor,"PO vendor",token);
      const duplicate=await supabaseRest<ErpDocument[]>(`erp_documents?user_id=eq.${user.id}&document_type=eq.IV&header->>vendor=eq.${encodeURIComponent(vendor)}&header->>supplier_invoice_number=eq.${encodeURIComponent(supplierInvoiceNumber)}&select=id,document_number,status&limit=1`,{},token);
      if(duplicate.length>0)return NextResponse.json({error:`Supplier invoice ${supplierInvoiceNumber} for vendor ${vendor} has already been entered as ${duplicate[0].document_number}.`},{status:409});
      const receipts=await supabaseRest<ErpDocument[]>(`erp_documents?user_id=eq.${user.id}&document_type=eq.GR&header->>source_po=eq.${encodeURIComponent(sourcePo)}&select=id,items`,{},token);if(receipts.length===0)return NextResponse.json({error:"Post at least one goods receipt before invoice verification."},{status:400});
      const item=po.items[0]??{},orderedQuantity=Number(item.quantity??0),unitPrice=Number(item.unit_price??0),poValue=orderedQuantity*unitPrice,receivedQuantity=receipts.reduce((sum,row)=>sum+Number(row.items?.[0]?.received_quantity??0),0),receivedValue=receivedQuantity*unitPrice,expectedValue=receivedValue;
      const variance=Number((invoiceValue-expectedValue).toFixed(2)),matchStatus=Math.abs(variance)<0.01?"matched":"mismatch",number=docNumber("IV");
      const invoiceStatus=matchStatus==="matched"?"posted":"blocked",blockReason=matchStatus==="matched"?null:`Invoice variance ${variance>0?"+":""}${variance.toFixed(2)} against received value.`;
      await supabaseRest("erp_documents",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({user_id:user.id,document_type:"IV",document_number:number,status:invoiceStatus,header:{source_po:po.document_number,vendor,supplier_invoice_number:supplierInvoiceNumber,invoice_date:invoiceDate,posting_date:postingDate,match_status:matchStatus,po_value:poValue,received_value:receivedValue,expected_value:expectedValue,invoice_value:invoiceValue,variance,block_reason:blockReason,ordered_quantity:orderedQuantity,received_quantity:receivedQuantity,unit_price:unitPrice},items:[]})},token);
      if(matchStatus==="matched"&&receivedQuantity>=orderedQuantity)await updateDocumentStatus(po.id,"closed",token);
      return NextResponse.json({posted:true,documentNumber:number,status:invoiceStatus,sourceDocument:po.document_number,vendor,supplierInvoiceNumber,invoiceDate,postingDate,matchStatus,poValue,receivedValue,expectedValue,invoiceValue,variance,blockReason,poStatus:matchStatus==="matched"&&receivedQuantity>=orderedQuantity?"closed":po.status,complete:matchStatus==="matched"&&receivedQuantity>=orderedQuantity});
    }
    return NextResponse.json({error:"Unsupported procurement action"},{status:400});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Master-data validation failed."},{status:400});}
}
