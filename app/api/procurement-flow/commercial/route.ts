import { NextResponse } from "next/server";
import { getSupabaseUser, supabaseRest } from "../../../../lib/supabase";

type ErpDocument={id:string;document_number:string;document_type:string;status:string;header:Record<string,unknown>;items:Array<Record<string,unknown>>;created_at:string};
type Body={action?:"set_po_terms"|"verify_invoice";data?:Record<string,unknown>};

function tokenOf(request:Request){const auth=request.headers.get("authorization");return auth?.startsWith("Bearer ")?auth.slice(7):undefined;}
async function findDoc(userId:string,token:string,number:string,type:string){const rows=await supabaseRest<ErpDocument[]>(`erp_documents?user_id=eq.${userId}&document_number=eq.${encodeURIComponent(number)}&document_type=eq.${type}&select=id,document_number,document_type,status,header,items,created_at&limit=1`,{},token);return rows[0]??null;}
async function receipts(userId:string,token:string,po:string){return supabaseRest<ErpDocument[]>(`erp_documents?user_id=eq.${userId}&document_type=eq.GR&status=neq.reversed&header->>source_po=eq.${encodeURIComponent(po)}&select=id,document_number,status,header,items,created_at`,{},token);}
function receiptTotals(rows:ErpDocument[]){const byLine=new Map<number,number>();for(const row of rows){for(const item of row.items??[]){const line=Number(item.line_number??0);byLine.set(line,(byLine.get(line)??0)+Number(item.received_quantity??0));}}return byLine;}
function money(value:number){return Number(value.toFixed(2));}

export async function POST(request:Request){
  const token=tokenOf(request);if(!token)return NextResponse.json({error:"Authentication required"},{status:401});
  const user=await getSupabaseUser(token);if(!user)return NextResponse.json({error:"Invalid session"},{status:401});
  const body=await request.json() as Body;const data=body.data??{};
  try{
    if(body.action==="set_po_terms"){
      const sourcePo=String(data.source_po??"").trim();const po=await findDoc(user.id,token,sourcePo,"PO");if(!po)return NextResponse.json({error:"Choose a purchase order that belongs to your account."},{status:400});
      const currency=String(data.currency??"INR").trim().toUpperCase();const paymentTerms=String(data.payment_terms??"NET30").trim().toUpperCase();const incoterm=String(data.incoterm??"DAP").trim().toUpperCase();const taxRate=Number(data.tax_rate??0);const toleranceAbs=Number(data.tolerance_abs??1);const tolerancePct=Number(data.tolerance_pct??0.5);
      if(!/^[A-Z]{3}$/.test(currency))return NextResponse.json({error:"Currency must be a 3-letter ISO-style code."},{status:400});
      if(taxRate<0||taxRate>100)return NextResponse.json({error:"Tax rate must be between 0 and 100 percent."},{status:400});
      if(toleranceAbs<0||tolerancePct<0)return NextResponse.json({error:"Invoice tolerances cannot be negative."},{status:400});
      const header={...po.header,currency,payment_terms:paymentTerms,incoterm,tax_rate:taxRate,tolerance_abs:toleranceAbs,tolerance_pct:tolerancePct,commercial_terms_configured:true};
      await supabaseRest(`erp_documents?id=eq.${po.id}`,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({header})},token);
      return NextResponse.json({updated:true,documentNumber:po.document_number,currency,paymentTerms,incoterm,taxRate,toleranceAbs,tolerancePct});
    }

    if(body.action==="verify_invoice"){
      const sourcePo=String(data.source_po??"").trim();const po=await findDoc(user.id,token,sourcePo,"PO");if(!po)return NextResponse.json({error:"Choose a purchase order that belongs to your account."},{status:400});
      const invoiceNet=Number(data.invoice_net??0);const invoiceTax=Number(data.invoice_tax??0);if(invoiceNet<=0||invoiceTax<0)return NextResponse.json({error:"Invoice net value must be positive and tax cannot be negative."},{status:400});
      const rec=await receipts(user.id,token,po.document_number);if(rec.length===0)return NextResponse.json({error:"Post at least one goods receipt before commercial invoice verification."},{status:400});
      const totals=receiptTotals(rec);let receivedNet=0;let receivedAll=true;const lines=[] as Record<string,unknown>[];
      for(const item of po.items){const line=Number(item.line_number??0),ordered=Number(item.quantity??0),price=Number(item.unit_price??0),received=totals.get(line)??0;receivedNet+=received*price;if(received<ordered)receivedAll=false;lines.push({line_number:line,material:item.material,ordered_quantity:ordered,received_quantity:received,unit_price:price,line_received_net:money(received*price)});}
      const taxRate=Number(po.header.tax_rate??0),expectedTax=money(receivedNet*(taxRate/100)),expectedGross=money(receivedNet+expectedTax),invoiceGross=money(invoiceNet+invoiceTax);const variance=money(invoiceGross-expectedGross);
      const toleranceAbs=Number(po.header.tolerance_abs??1),tolerancePct=Number(po.header.tolerance_pct??0.5),toleranceByPct=money(expectedGross*(tolerancePct/100)),allowedVariance=Math.max(toleranceAbs,toleranceByPct),withinTolerance=Math.abs(variance)<=allowedVariance+0.00001;
      const status=withinTolerance?"matched":"blocked";const blockReason=withinTolerance?null:`Gross invoice variance ${variance>=0?"+":""}${variance.toFixed(2)} exceeds allowed tolerance ${allowedVariance.toFixed(2)}.`;
      return NextResponse.json({status,sourceDocument:po.document_number,currency:String(po.header.currency??"INR"),paymentTerms:String(po.header.payment_terms??"NET30"),incoterm:String(po.header.incoterm??"DAP"),taxRate,receivedNet:money(receivedNet),expectedTax,expectedGross,invoiceNet:money(invoiceNet),invoiceTax:money(invoiceTax),invoiceGross,variance,allowedVariance,withinTolerance,receivedAll,blockReason,lines});
    }

    return NextResponse.json({error:"Unsupported commercial action"},{status:400});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Commercial purchasing operation failed."},{status:400});}
}
