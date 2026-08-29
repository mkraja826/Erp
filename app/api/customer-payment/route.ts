import { NextResponse } from "next/server";
import { getSupabaseUser, supabaseRest } from "../../../lib/supabase";

type ErpDocument={id:string;document_number:string;document_type:string;status:string;header:Record<string,unknown>;items:Array<Record<string,unknown>>;created_at:string};
type Body={action?:"post_payment"|"reverse_payment";data?:Record<string,unknown>};
function tokenOf(request:Request){const auth=request.headers.get("authorization");return auth?.startsWith("Bearer ")?auth.slice(7):undefined;}
function number(prefix:string){return `${prefix}-${Date.now().toString().slice(-9)}`;}
async function findDoc(userId:string,token:string,doc:string,type:string){const rows=await supabaseRest<ErpDocument[]>(`erp_documents?user_id=eq.${userId}&document_number=eq.${encodeURIComponent(doc)}&document_type=eq.${type}&select=id,document_number,document_type,status,header,items,created_at&limit=1`,{},token);return rows[0]??null;}
async function patch(doc:ErpDocument,token:string,status:string,header:Record<string,unknown>){await supabaseRest(`erp_documents?id=eq.${doc.id}`,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({status,header})},token);}
async function existingPayment(userId:string,token:string,fi:string){const rows=await supabaseRest<ErpDocument[]>(`erp_documents?user_id=eq.${userId}&document_type=eq.AR_PAYMENT&header->>receivable_fi=eq.${encodeURIComponent(fi)}&status=neq.reversed&select=id,document_number,document_type,status,header,items,created_at&limit=1`,{},token);return rows[0]??null;}

export async function POST(request:Request){
  const token=tokenOf(request);if(!token)return NextResponse.json({error:"Authentication required"},{status:401});
  const user=await getSupabaseUser(token);if(!user)return NextResponse.json({error:"Invalid session"},{status:401});
  const body=await request.json() as Body;const data=body.data??{};
  try{
    if(body.action==="post_payment"){
      const fiNumber=String(data.receivable_fi??"").trim(),bankReference=String(data.bank_reference??"").trim(),paymentDate=String(data.payment_date??new Date().toISOString().slice(0,10));const amount=Number(data.payment_amount??0);
      if(!fiNumber||!bankReference||amount<=0)return NextResponse.json({error:"Receivable FI, payment amount and bank reference are required."},{status:400});
      const fi=await findDoc(user.id,token,fiNumber,"FI");if(!fi)return NextResponse.json({error:"Receivable FI document not found."},{status:404});if(String(fi.header.source_type??"")!=="BILL")return NextResponse.json({error:"Only customer receivable FI documents can be cleared here."},{status:400});if(fi.status!=="posted")return NextResponse.json({error:`FI document ${fi.document_number} is ${fi.status}.`},{status:409});if(String(fi.header.clearing_status??"open")==="cleared")return NextResponse.json({error:`Customer receivable ${fi.document_number} is already cleared.`},{status:409});
      const open=Number(fi.header.open_customer_amount??fi.header.total_debit??0);if(Math.abs(open-amount)>0.01)return NextResponse.json({error:`This phase supports full-item clearing only. Open amount is ${open}.`},{status:409});const duplicate=await existingPayment(user.id,token,fi.document_number);if(duplicate)return NextResponse.json({error:`Payment ${duplicate.document_number} already clears this receivable.`},{status:409});
      const doc=number("AR-PAY"),currency=String(fi.header.currency??"INR"),customer=String(fi.header.customer??"");const items=[{account:"110000",account_name:"Bank",debit:amount,credit:0,text:`Incoming customer payment ${bankReference}`},{account:"120000",account_name:"Customer receivable",debit:0,credit:amount,text:`Clear receivable ${fi.document_number}`}];
      await supabaseRest("erp_documents",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({user_id:user.id,document_type:"AR_PAYMENT",document_number:doc,status:"posted",header:{receivable_fi:fi.document_number,customer,currency,payment_amount:amount,payment_date:paymentDate,bank_reference:bankReference,accounting_phase:"FI-AR",balanced:true},items})},token);await patch(fi,token,"posted",{...fi.header,clearing_status:"cleared",open_customer_amount:0,cleared_by:doc,clearing_date:paymentDate});
      return NextResponse.json({posted:true,documentNumber:doc,status:"posted",receivableFi:fi.document_number,customer,paymentAmount:amount,clearingStatus:"cleared",balanced:true,items});
    }
    if(body.action==="reverse_payment"){
      const paymentNumber=String(data.payment_document??"").trim();const payment=await findDoc(user.id,token,paymentNumber,"AR_PAYMENT");if(!payment)return NextResponse.json({error:"Customer payment document not found."},{status:404});if(payment.status!=="posted")return NextResponse.json({error:`Payment ${payment.document_number} is ${payment.status} and cannot be reversed.`},{status:409});const fi=await findDoc(user.id,token,String(payment.header.receivable_fi??""),"FI");if(!fi)return NextResponse.json({error:"Cleared receivable FI document not found."},{status:404});
      const reversal=number("AR-REV"),amount=Number(payment.header.payment_amount??0),items=(payment.items??[]).map(x=>({...x,debit:Number(x.credit??0),credit:Number(x.debit??0),text:`Reversal · ${String(x.text??"")}`}));await supabaseRest("erp_documents",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({user_id:user.id,document_type:"AR_PAYMENT",document_number:reversal,status:"posted",header:{receivable_fi:fi.document_number,reversal_of:payment.document_number,customer:payment.header.customer,currency:payment.header.currency,payment_amount:amount,payment_date:new Date().toISOString().slice(0,10),accounting_phase:"FI-AR",balanced:true},items})},token);await patch(payment,token,"reversed",{...payment.header,reversed_by:reversal});await patch(fi,token,"posted",{...fi.header,clearing_status:"open",open_customer_amount:amount,cleared_by:null,clearing_date:null});
      return NextResponse.json({reversed:true,documentNumber:payment.document_number,status:"reversed",reversalDocument:reversal,receivableFi:fi.document_number,clearingStatus:"open",openCustomerAmount:amount,items});
    }
    return NextResponse.json({error:"Unsupported customer payment action."},{status:400});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Unable to process customer payment."},{status:500});}
}
