import { NextResponse } from "next/server";
import { getSupabaseUser, supabaseRest } from "../../../lib/supabase";

type ErpDocument={id:string;document_number:string;document_type:string;status:string;header:Record<string,unknown>;items:Array<Record<string,unknown>>;created_at:string};
type Body={action?:"create"|"deactivate";data?:Record<string,unknown>};
function tokenOf(request:Request){const auth=request.headers.get("authorization");return auth?.startsWith("Bearer ")?auth.slice(7):undefined;}
async function findCustomer(userId:string,token:string,code:string){const rows=await supabaseRest<ErpDocument[]>(`erp_documents?user_id=eq.${userId}&document_type=eq.CUSTOMER_MASTER&document_number=eq.${encodeURIComponent(code)}&select=id,document_number,document_type,status,header,items,created_at&limit=1`,{},token);return rows[0]??null;}

export async function POST(request:Request){
  const token=tokenOf(request);if(!token)return NextResponse.json({error:"Authentication required"},{status:401});
  const user=await getSupabaseUser(token);if(!user)return NextResponse.json({error:"Invalid session"},{status:401});
  const body=await request.json() as Body;const data=body.data??{};
  try{
    if(body.action==="create"){
      const code=String(data.customer_code??"").trim().toUpperCase(),name=String(data.name??"").trim(),currency=String(data.currency??"INR").trim()||"INR",paymentTerms=String(data.payment_terms??"NET30").trim()||"NET30",creditLimit=Number(data.credit_limit??0);
      if(!code||!name)return NextResponse.json({error:"Customer code and name are required."},{status:400});if(creditLimit<0)return NextResponse.json({error:"Credit limit cannot be negative."},{status:400});
      const existing=await findCustomer(user.id,token,code);if(existing)return NextResponse.json({error:`Customer ${code} already exists.`},{status:409});
      await supabaseRest("erp_documents",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({user_id:user.id,document_type:"CUSTOMER_MASTER",document_number:code,status:"active",header:{name,currency,payment_terms:paymentTerms,credit_limit:creditLimit,master_phase:"SD"},items:[]})},token);
      return NextResponse.json({created:true,customerCode:code,status:"active",name,currency,paymentTerms,creditLimit});
    }
    if(body.action==="deactivate"){
      const code=String(data.customer_code??"").trim().toUpperCase();const customer=await findCustomer(user.id,token,code);if(!customer)return NextResponse.json({error:"Customer master not found."},{status:404});if(customer.status!=="active")return NextResponse.json({error:`Customer ${code} is already ${customer.status}.`},{status:409});
      await supabaseRest(`erp_documents?id=eq.${customer.id}`,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({status:"inactive",header:{...customer.header,deactivated_at:new Date().toISOString()}})},token);return NextResponse.json({updated:true,customerCode:code,status:"inactive"});
    }
    return NextResponse.json({error:"Unsupported customer master action."},{status:400});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Unable to process customer master."},{status:500});}
}
