import { NextResponse } from "next/server";
import { getSupabaseUser, supabaseRest } from "../../../lib/supabase";

type ErpDocument={id:string;document_number:string;document_type:string;status:string;header:Record<string,unknown>;items:Array<Record<string,unknown>>;created_at:string};
type Body={action?:"post_source"|"reverse_fi";data?:Record<string,unknown>};

function tokenOf(request:Request){const auth=request.headers.get("authorization");return auth?.startsWith("Bearer ")?auth.slice(7):undefined;}
function docNumber(){return `FI-${Date.now().toString().slice(-9)}`;}
async function findDoc(userId:string,token:string,number:string,type?:string){const typeFilter=type?`&document_type=eq.${encodeURIComponent(type)}`:"";const rows=await supabaseRest<ErpDocument[]>(`erp_documents?user_id=eq.${userId}&document_number=eq.${encodeURIComponent(number)}${typeFilter}&select=id,document_number,document_type,status,header,items,created_at&limit=1`,{},token);return rows[0]??null;}
async function existingFi(userId:string,token:string,source:string){const rows=await supabaseRest<ErpDocument[]>(`erp_documents?user_id=eq.${userId}&document_type=eq.FI&header->>source_document=eq.${encodeURIComponent(source)}&status=neq.reversed&select=id,document_number,document_type,status,header,items,created_at&limit=1`,{},token);return rows[0]??null;}
function amount(n:unknown){return Number(Number(n??0).toFixed(2));}
function line(account:string,account_name:string,debit:number,credit:number,text:string){return {account,account_name,debit:amount(debit),credit:amount(credit),text};}
function totals(items:Array<Record<string,unknown>>){const debit=amount(items.reduce((s,x)=>s+Number(x.debit??0),0));const credit=amount(items.reduce((s,x)=>s+Number(x.credit??0),0));return {debit,credit,balanced:Math.abs(debit-credit)<0.01};}

export async function POST(request:Request){
  const token=tokenOf(request);if(!token)return NextResponse.json({error:"Authentication required"},{status:401});
  const user=await getSupabaseUser(token);if(!user)return NextResponse.json({error:"Invalid session"},{status:401});
  const body=await request.json() as Body;const data=body.data??{};
  try{
    if(body.action==="post_source"){
      const sourceNumber=String(data.source_document??"").trim();if(!sourceNumber)return NextResponse.json({error:"Source document is required."},{status:400});
      const source=await findDoc(user.id,token,sourceNumber);if(!source)return NextResponse.json({error:"Source ERP document not found."},{status:404});
      if(!["GR","IV"].includes(source.document_type))return NextResponse.json({error:"Only goods receipt and invoice documents create FI accounting impact in this phase."},{status:400});
      if(source.status==="reversed")return NextResponse.json({error:`${source.document_type} ${source.document_number} is reversed and cannot create a new FI document.`},{status:400});
      const duplicate=await existingFi(user.id,token,source.document_number);if(duplicate)return NextResponse.json({posted:true,documentNumber:duplicate.document_number,status:duplicate.status,duplicate:true,sourceDocument:source.document_number,items:duplicate.items,...totals(duplicate.items)});

      const currency=String(source.header.currency??"INR");let items:Array<Record<string,unknown>>=[];let postingDate=String(source.header.posting_date??new Date().toISOString().slice(0,10));let referenceType="";
      if(source.document_type==="GR"){
        const sourcePo=String(source.header.source_po??"");const po=sourcePo?await findDoc(user.id,token,sourcePo,"PO"):null;if(!po)return NextResponse.json({error:"Source purchase order for goods receipt not found."},{status:400});
        let value=0;for(const grItem of source.items??[]){const lineNo=Number(grItem.line_number??0);const poItem=po.items.find(x=>Number(x.line_number??0)===lineNo);value+=Number(grItem.received_quantity??0)*Number(poItem?.unit_price??0);}value=amount(value);
        items=[line("140000","Inventory",value,0,`Goods receipt ${source.document_number}`),line("210000","GR/IR clearing",0,value,`Goods receipt ${source.document_number}`)];referenceType="GR";
      } else {
        if(source.status!=="posted")return NextResponse.json({error:"Only posted invoices create an FI accounting document. Blocked invoices must be resolved first."},{status:409});
        const net=amount(source.header.received_net_value??source.header.received_value??source.header.po_value??0);const tax=amount(source.header.expected_tax??Math.max(0,Number(source.header.invoice_value??0)-net));const gross=amount(source.header.invoice_gross??source.header.invoice_value??net+tax);const grir=amount(Math.min(net,gross));items=[line("210000","GR/IR clearing",grir,0,`Invoice ${source.document_number}`)];if(tax>0)items.push(line("150000","Input tax",tax,0,`Invoice tax ${source.document_number}`));items.push(line("300000","Vendor payable",0,gross,`Vendor invoice ${source.document_number}`));const t=totals(items);if(!t.balanced){const diff=amount(t.credit-t.debit);items.splice(items.length-1,0,line("659000","Invoice price difference",Math.max(diff,0),Math.max(-diff,0),`Invoice variance ${source.document_number}`));}referenceType="IV";
      }
      const t=totals(items);if(!t.balanced)return NextResponse.json({error:"Generated accounting entry is not balanced."},{status:500});
      const number=docNumber();await supabaseRest("erp_documents",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({user_id:user.id,document_type:"FI",document_number:number,status:"posted",header:{source_document:source.document_number,source_type:referenceType,posting_date:postingDate,currency,total_debit:t.debit,total_credit:t.credit,balanced:true,accounting_phase:"MM-FI"},items})},token);
      return NextResponse.json({posted:true,documentNumber:number,status:"posted",sourceDocument:source.document_number,sourceType:referenceType,currency,items,...t});
    }

    if(body.action==="reverse_fi"){
      const fiNumber=String(data.fi_document??"").trim();const fi=await findDoc(user.id,token,fiNumber,"FI");if(!fi)return NextResponse.json({error:"FI document not found."},{status:404});if(fi.status!=="posted")return NextResponse.json({error:`FI document ${fi.document_number} is ${fi.status} and cannot be reversed.`},{status:400});
      const reversalItems=(fi.items??[]).map(x=>({...x,debit:amount(x.credit),credit:amount(x.debit),text:`Reversal · ${String(x.text??"")}`}));const t=totals(reversalItems);const reversalNumber=docNumber();await supabaseRest("erp_documents",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({user_id:user.id,document_type:"FI",document_number:reversalNumber,status:"posted",header:{source_document:fi.document_number,source_type:"FI_REVERSAL",reversal_of:fi.document_number,posting_date:new Date().toISOString().slice(0,10),currency:fi.header.currency??"INR",total_debit:t.debit,total_credit:t.credit,balanced:true,accounting_phase:"MM-FI"},items:reversalItems})},token);await supabaseRest(`erp_documents?id=eq.${fi.id}`,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({status:"reversed",header:{...fi.header,reversed_by:reversalNumber,reversal_date:new Date().toISOString().slice(0,10)}})},token);
      return NextResponse.json({reversed:true,documentNumber:fi.document_number,status:"reversed",reversalDocument:reversalNumber,items:reversalItems,...t});
    }
    return NextResponse.json({error:"Unsupported accounting action."},{status:400});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Unable to process accounting impact."},{status:500});}
}
