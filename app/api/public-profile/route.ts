import { NextResponse } from "next/server";
import { supabaseRest } from "../../../lib/supabase";

export async function GET(request:Request){
  const slug=new URL(request.url).searchParams.get("slug")?.trim();
  if(!slug)return NextResponse.json({error:"slug is required"},{status:400});
  const rows=await supabaseRest<unknown>("rpc/get_public_skill_profile",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({p_slug:slug})});
  if(!rows)return NextResponse.json({error:"Profile not found"},{status:404});
  return NextResponse.json(rows);
}
