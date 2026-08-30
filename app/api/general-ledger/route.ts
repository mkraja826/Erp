import { NextResponse } from "next/server";
import { getSupabaseUser, supabaseRest } from "../../../lib/supabase";

type ErpDocument={id:string;document_number:string;document_type:string;status:string;header:Record<string,unknown>;items:Array<Record<string,unknown>>;created_at:string};
type Body={action?:"post_journal"|"trial_balance"|"financial_statements";data?:Record<string,unknown>};
type JournalLine={account?:unknown;account_name?:unknown;debit?:unknown;credit?:unknown;text?:unknown};
const COA:Record<string,{name:string;type:"asset"|"liability"|"equity"|"revenue"|"expense"}>={
 "110000":{name:"Bank",type:"asset"},"120000":{name:"Customer receivable",type:"asset"},"140000":{name:"Inventory",type:"asset"},"150000":{name:"Input tax",type:"asset"},
 "210000":{name:"GR/IR clearing",type:"liability"},"300000":{name:"Vendor payable",type:"liability"},"310000":{name:"Equity",type:"equity"},"400000":{name:"Sales revenue",type:"revenue"},"659000":{name:"Invoice price difference",type:"expense"},"660000":{name:"General expense",type:"expense"}
};
function tokenOf(r:Request){const a=r.headers.get("authorization");return a?.startsWith("Bearer ")?a.slice(7):undefined;}
function money(v:unknown){return Number(Number(v??0).toFixed(2));}
function periodOf(date:string){return /^\d{4}-\d{2}-\d{2}$/.test(date)?date.slice(0,7):"";}
function journalNumber(){return `JE-${Date.now().toString().slice(-9)}`;}
async function fiDocs(userId:string,token:string,period?:string){const rows=await supabaseRest<ErpDocument[]>(`erp_documents?user_id=eq.${userId}&document_type=eq.FI&status=eq.posted&select=id,document_number,document_type,status,header,items,created_at&order=created_at.asc`,{},token);return period?rows.filter(x=>String(x.header.posting_date??x.created_at).slice(0,7)===period):rows;}
function aggregate(docs:ErpDocument[]){const map=new Map<string,{account:string;account_name:string;account_type:string;debit:number;credit:number;balance:number}>();for(const d of docs)for(const raw of d.items??[]){const account=String(raw.account??"");if(!account)continue;const coa=COA[account],cur=map.get(account)??{account,account_name:String(raw.account_name??coa?.name??account),account_type:coa?.type??"unknown",debit:0,credit:0,balance:0};cur.debit=money(cur.debit+Number(raw.debit??0));cur.credit=money(cur.credit+Number(raw.credit??0));cur.balance=money(cur.debit-cur.credit);map.set(account,cur);}return [...map.values()].sort((a,b)=>a.account.localeCompare(b.account));}
export async function POST(request:Request){const token=tokenOf(request);if(!token)return NextResponse.json({error:"Authentication required"},{status:401});const user=await getSupabaseUser(token);if(!user)return NextResponse.json({error:"Invalid session"},{status:401});const body=await request.json() as Body,data=body.data??{};try{
 if(body.action==="post_journal"){
  const postingDate=String(data.posting_date??new Date().toISOString().slice(0,10)),period=periodOf(postingDate),currency=String(data.currency??"INR"),reference=String(data.reference??"").trim(),lines=Array.isArray(data.items)?data.items as JournalLine[]:[];
  if(!period)return NextResponse.json({error:"Posting date must be YYYY-MM-DD."},{status:400});if(lines.length<2)return NextResponse.json({error:"A journal entry requires at least two lines."},{status:400});
  const items=[] as Array<Record<string,unknown>>;for(const raw of lines){const account=String(raw.account??"").trim(),coa=COA[account],debit=money(raw.debit),credit=money(raw.credit);if(!coa)return NextResponse.json({error:`Account ${account||"(blank)"} is not in the chart of accounts.`},{status:400});if(debit<0||credit<0||(!debit&&!credit)||(debit&&credit))return NextResponse.json({error:`Account ${account} must contain either a positive debit or positive credit.`},{status:400});items.push({account,account_name:coa.name,account_type:coa.type,debit,credit,text:String(raw.text??"")});}
  const totalDebit=money(items.reduce((s,x)=>s+Number(x.debit??0),0)),totalCredit=money(items.reduce((s,x)=>s+Number(x.credit??0),0));if(Math.abs(totalDebit-totalCredit)>0.01)return NextResponse.json({error:`Journal is not balanced. Debit ${totalDebit}, credit ${totalCredit}.`},{status:409});
  const doc=journalNumber();await supabaseRest("erp_documents",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({user_id:user.id,document_type:"FI",document_number:doc,status:"posted",header:{source_type:"MANUAL_JOURNAL",posting_date:postingDate,fiscal_period:period,currency,reference,total_debit:totalDebit,total_credit:totalCredit,balanced:true,accounting_phase:"FI-GL"},items})},token);return NextResponse.json({posted:true,documentNumber:doc,status:"posted",fiscalPeriod:period,totalDebit,totalCredit,balanced:true,items});
 }
 if(body.action==="trial_balance"){
  const period=String(data.fiscal_period??"").trim();if(period&&!/^\d{4}-\d{2}$/.test(period))return NextResponse.json({error:"Fiscal period must be YYYY-MM."},{status:400});const rows=aggregate(await fiDocs(user.id,token,period||undefined));const totalDebit=money(rows.reduce((s,x)=>s+x.debit,0)),totalCredit=money(rows.reduce((s,x)=>s+x.credit,0));return NextResponse.json({fiscalPeriod:period||"all",rows,totalDebit,totalCredit,balanced:Math.abs(totalDebit-totalCredit)<0.01});
 }
 if(body.action==="financial_statements"){
  const period=String(data.fiscal_period??"").trim();if(period&&!/^\d{4}-\d{2}$/.test(period))return NextResponse.json({error:"Fiscal period must be YYYY-MM."},{status:400});const rows=aggregate(await fiDocs(user.id,token,period||undefined));const by=(t:string)=>rows.filter(x=>x.account_type===t);const assets=money(by("asset").reduce((s,x)=>s+x.balance,0)),liabilities=money(by("liability").reduce((s,x)=>s-x.balance,0)),equity=money(by("equity").reduce((s,x)=>s-x.balance,0)),revenue=money(by("revenue").reduce((s,x)=>s-x.balance,0)),expenses=money(by("expense").reduce((s,x)=>s+x.balance,0)),profit=money(revenue-expenses);return NextResponse.json({fiscalPeriod:period||"all",profitAndLoss:{revenue,expenses,profit},balanceSheet:{assets,liabilities,equity,currentPeriodProfit:profit,liabilitiesAndEquity:money(liabilities+equity+profit)},rows});
 }
 return NextResponse.json({error:"Unsupported general-ledger action."},{status:400});
}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Unable to process general ledger."},{status:500});}}
