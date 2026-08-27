import { NextResponse } from "next/server";
import { supabaseRest } from "../../../lib/supabase";

export async function GET(request:Request){
  const code=new URL(request.url).searchParams.get("code")?.trim();
  if(!code)return NextResponse.json({error:"code is required"},{status:400});
  const result=await supabaseRest<unknown>("rpc/verify_public_certificate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({p_code:code})});
  if(!result)return NextResponse.json({valid:false,error:"Certificate not found"},{status:404});
  return NextResponse.json(result);
}
