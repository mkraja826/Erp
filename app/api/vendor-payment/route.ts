import { NextResponse } from "next/server";
import { getSupabaseUser, supabaseRest } from "../../../lib/supabase";

type ErpDocument={id:string;document_number:string;document_type:string;status:string;header:Record<string,unknown>;items:Array<Record<string,unknown>>;created_at:string};
type Body={action?:"post_payment"|"reverse_payment";data?:Record<string,unknown>};

function tokenOf(request:Request){const auth=request.headers.get("authorization");return auth?.startsWith("Bearer ")?auth.slice(7):undefined;}
function paymentNumber(){return `PAY-${Date.now().toString().slice(-9)}`;}
function fiNumber(){return `FI-${Date.now().toString().slice(-9)}`;}
function amount(value:unknown){return Number(Number(value??0).toFixed(2));}
async function findDoc(userId:string,token:string,number:string,type?:string){const typeFilter=type?`&document_type=eq.${encodeURIComponent(type)}`:"";const rows=await supabaseRest<ErpDocument[]>(`erp_documents?user_id=eq.${userId}&document_number=eq.${encodeURIComponent(number)}${typeFilter}&select=id,document_number,document_type,status,header,items,created_at&limit=1`,{},token);return rows[0]??null;}
async function activePayment(userId:string,token:string,invoiceFi:string){const rows=await supabaseRest<ErpDocument[]>(`erp_documents?user_id=eq.${userId}&document_type=eq.PAY&status=neq.reversed&header->>cleared_fi=eq.${encodeURIComponent(invoiceFi)}&select=id,document_number,document_type,status,header,items,created_at&limit=1`,{},token);return rows[0]??null;}
async function patch(doc:ErpDocument,token:string,status:string,header:Record<string,unknown>){await supabaseRest(`erp_documents?id=eq.${doc.id}`,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({status,header})},token);}
function vendorCredit(fi:ErpDocument){return amount((fi.items??[]).filter(x=>String(x.account??"")==="300000").reduce((sum,x)=>sum+Number(x.credit??0)-Number(x.debit??0),0));}

export async function POST(request:Request){
  const token=tokenOf(request);if(!token)return NextResponse.json({error:"Authentication required"},{status:401});
  const user=await getSupabaseUser(token);if(!user)return NextResponse.json({error:"Invalid session"},{status:401});
  const body=await request.json() as Body;const data=body.data??{};
  try{
    if(body.action==="post_payment"){
      const invoiceFiNumber=String(data.invoice_fi??"").trim();const bankReference=String(data.bank_reference??"").trim();const paymentDate=String(data.payment_date??new Date().toISOString().slice(0,10));
      const invoiceFi=await findDoc(user.id,token,invoiceFiNumber,"FI");if(!invoiceFi)return NextResponse.json({error:"Invoice FI document not found."},{status:404});
      if(invoiceFi.status!=="posted"||String(invoiceFi.header.source_type??"")!=="IV")return NextResponse.json({error:"Only an active invoice FI document can be paid."},{status:400});
      if(String(invoiceFi.header.clearing_status??"open")==="cleared")return NextResponse.json({error:`Vendor item ${invoiceFi.document_number} is already cleared.`},{status:409});
      const duplicate=await activePayment(user.id,token,invoiceFi.document_number);if(duplicate)return NextResponse.json({error:`Payment ${duplicate.document_number} already clears this vendor item.`},{status:409});
      const payable=vendorCredit(invoiceFi);if(payable<=0)return NextResponse.json({error:"Invoice FI document has no open vendor payable amount."},{status:400});
      const requested=amount(data.payment_amount??payable);if(Math.abs(requested-payable)>=0.01)return NextResponse.json({error:`Phase 4E requires full-item clearing. Open vendor amount is ${payable.toFixed(2)}.`},{status:400});
      if(!bankReference)return NextResponse.json({error:"Bank reference is required for payment posting."},{status:400});
      const currency=String(invoiceFi.header.currency??"INR"),number=paymentNumber();const items=[{account:"300000",account_name:"Vendor payable",debit:payable,credit:0,text:`Clear ${invoiceFi.document_number}`},{account:"110000",account_name:"Bank",debit:0,credit:payable,text:`Bank payment ${bankReference}`}];
      await supabaseRest("erp_documents",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({user_id:user.id,document_type:"PAY",document_number:number,status:"posted",header:{cleared_fi:invoiceFi.document_number,source_invoice:invoiceFi.header.source_document??null,vendor:invoiceFi.header.vendor??null,payment_date:paymentDate,bank_reference:bankReference,currency,payment_amount:payable,clearing_status:"cleared",accounting_phase:"FI-PAYMENT"},items})},token);
      await patch(invoiceFi,token,"posted",{...invoiceFi.header,clearing_status:"cleared",cleared_by:number,clearing_date:paymentDate,open_vendor_amount:0});
      return NextResponse.json({posted:true,documentNumber:number,status:"posted",clearedFi:invoiceFi.document_number,clearingStatus:"cleared",paymentAmount:payable,currency,items});
    }

    if(body.action==="reverse_payment"){
      const paymentDoc=String(data.payment_document??"").trim();const payment=await findDoc(user.id,token,paymentDoc,"PAY");if(!payment)return NextResponse.json({error:"Payment document not found."},{status:404});if(payment.status!=="posted")return NextResponse.json({error:`Payment ${payment.document_number} is ${payment.status} and cannot be reversed.`},{status:400});
      const invoiceFi=await findDoc(user.id,token,String(payment.header.cleared_fi??""),"FI");if(!invoiceFi)return NextResponse.json({error:"Cleared invoice FI document not found."},{status:400});const value=amount(payment.header.payment_amount??0);const reversal=fiNumber();const items=[{account:"110000",account_name:"Bank",debit:value,credit:0,text:`Reverse payment ${payment.document_number}`},{account:"300000",account_name:"Vendor payable",debit:0,credit:value,text:`Reopen ${invoiceFi.document_number}`}];
      await supabaseRest("erp_documents",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({user_id:user.id,document_type:"FI",document_number:reversal,status:"posted",header:{source_document:payment.document_number,source_type:"PAYMENT_REVERSAL",reversal_of:payment.document_number,posting_date:new Date().toISOString().slice(0,10),currency:payment.header.currency??"INR",total_debit:value,total_credit:value,balanced:true,accounting_phase:"FI-PAYMENT"},items})},token);
      await patch(payment,token,"reversed",{...payment.header,reversed_by:reversal,reversal_date:new Date().toISOString().slice(0,10),clearing_status:"reversed"});
      await patch(invoiceFi,token,"posted",{...invoiceFi.header,clearing_status:"open",cleared_by:null,clearing_date:null,open_vendor_amount:value,payment_reversal:reversal});
      return NextResponse.json({reversed:true,documentNumber:payment.document_number,status:"reversed",reversalDocument:reversal,reopenedFi:invoiceFi.document_number,clearingStatus:"open",paymentAmount:value,items});
    }
    return NextResponse.json({error:"Unsupported vendor payment action."},{status:400});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Unable to process vendor payment."},{status:500});}
}
