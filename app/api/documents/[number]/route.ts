import { NextResponse } from "next/server";
import { getSupabaseUser, supabaseRest } from "../../../../lib/supabase";

type Doc={id:string;document_number:string;document_type:string;status:string;header:Record<string,unknown>;items:Array<Record<string,unknown>>;created_at:string};
type Balance={material_code:string;plant_code:string;storage_location_code:string;quantity:number};

function tokenFrom(request:Request){const auth=request.headers.get("authorization");return auth?.startsWith("Bearer ")?auth.slice(7):undefined;}
function metrics(d:Doc){
  if(d.document_type==="PR")return {quantity:Number(d.items?.[0]?.quantity??0),material:String(d.items?.[0]?.material??""),plant:String(d.header.plant??"")};
  if(d.document_type==="PO"){const q=Number(d.items?.[0]?.quantity??0),p=Number(d.items?.[0]?.unit_price??0);return {quantity:q,unitPrice:p,value:q*p,material:String(d.items?.[0]?.material??""),plant:String(d.header.plant??""),vendor:String(d.header.vendor??"")};}
  if(d.document_type==="GR")return {quantity:Number(d.items?.[0]?.received_quantity??0),material:String(d.items?.[0]?.material??""),plant:String(d.header.plant??""),storageLocation:String(d.header.storage_location??""),movementType:String(d.header.movement_type??""),openQuantity:Number(d.header.open_quantity_after??0)};
  if(d.document_type==="IV")return {invoiceValue:Number(d.header.invoice_value??0),receivedValue:Number(d.header.received_value??0),variance:Number(d.header.variance??0),matchStatus:String(d.header.match_status??""),supplierInvoiceNumber:String(d.header.supplier_invoice_number??"")};
  return {};
}

export async function GET(request:Request,{params}:{params:Promise<{number:string}>}){
  const token=tokenFrom(request);if(!token)return NextResponse.json({error:"Authentication required"},{status:401});
  const user=await getSupabaseUser(token);if(!user)return NextResponse.json({error:"Invalid session"},{status:401});
  const {number}=await params;const decoded=decodeURIComponent(number);
  const rows=await supabaseRest<Doc[]>(`erp_documents?user_id=eq.${user.id}&document_number=eq.${encodeURIComponent(decoded)}&select=id,document_number,document_type,status,header,items,created_at&limit=1`,{},token);
  const document=rows[0];if(!document)return NextResponse.json({error:"Document not found"},{status:404});
  const all=await supabaseRest<Doc[]>(`erp_documents?user_id=eq.${user.id}&select=id,document_number,document_type,status,header,items,created_at&order=created_at.asc`,{},token);

  let poNumber="";let prNumber="";
  if(document.document_type==="PR")prNumber=document.document_number;
  if(document.document_type==="PO"){poNumber=document.document_number;prNumber=String(document.header.source_pr??"");}
  if(document.document_type==="GR"||document.document_type==="IV"){poNumber=String(document.header.source_po??"");const po=all.find(d=>d.document_number===poNumber);prNumber=String(po?.header.source_pr??"");}

  const poNumbers=new Set<string>();
  if(poNumber)poNumbers.add(poNumber);
  if(prNumber)all.filter(d=>d.document_type==="PO"&&String(d.header.source_pr??"")===prNumber).forEach(d=>poNumbers.add(d.document_number));

  const chain=all.filter(d=>
    (prNumber&&d.document_number===prNumber)||
    poNumbers.has(d.document_number)||
    ((d.document_type==="GR"||d.document_type==="IV")&&poNumbers.has(String(d.header.source_po??"")))
  ).sort((a,b)=>new Date(a.created_at).getTime()-new Date(b.created_at).getTime());

  const balances=await supabaseRest<Balance[]>(`erp_inventory_balances?user_id=eq.${user.id}&select=material_code,plant_code,storage_location_code,quantity`,{},token);
  const flow=chain.map(d=>{
    let relation="Related document";
    if(d.document_number===document.document_number)relation="Current document";
    else if(d.document_type==="PR")relation="Predecessor requisition";
    else if(d.document_type==="PO")relation=document.document_type==="PR"?"Successor purchase order":"Related purchase order";
    else if(d.document_type==="GR")relation="Goods receipt";
    else if(d.document_type==="IV")relation="Supplier invoice";
    const m=metrics(d) as Record<string,unknown>;
    let inventoryImpact:null|Record<string,unknown>=null;
    if(d.document_type==="GR"){
      const material=String(m.material??""),plant=String(m.plant??""),storage=String(m.storageLocation??"");
      const balance=balances.find(b=>b.material_code===material&&b.plant_code===plant&&b.storage_location_code===storage);
      inventoryImpact={material,plant,storageLocation:storage,postedQuantity:Number(m.quantity??0),currentStock:Number(balance?.quantity??0)};
    }
    return {...d,relation,metrics:m,inventoryImpact};
  });

  const linkedDocuments=flow.filter(d=>d.document_number!==document.document_number);
  return NextResponse.json({document,linkedDocuments,documentFlow:flow});
}
