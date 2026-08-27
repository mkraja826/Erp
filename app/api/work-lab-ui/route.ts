import { NextResponse } from "next/server";
import { supabaseRest } from "../../../lib/supabase";

type Row = { id:string; expected_state:{ expected?:unknown } };
function labelFor(key:string){return key.replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase());}
function fieldType(key:string,value:unknown){return typeof value==="number"||key.includes("quantity")||key.includes("value")||key.includes("price")?"number":"text";}
export async function GET(request:Request){
  const taskId=new URL(request.url).searchParams.get("taskId");
  if(!taskId)return NextResponse.json({error:"taskId is required"},{status:400});
  const rows=await supabaseRest<Row[]>(`work_lab_tasks?id=eq.${taskId}&select=id,expected_state&limit=1`);
  const row=rows[0]; if(!row)return NextResponse.json({error:"Task not found"},{status:404});
  const expected=row.expected_state?.expected;
  const fields=expected&&typeof expected==="object"&&!Array.isArray(expected)?Object.entries(expected as Record<string,unknown>).map(([key,value])=>({key,label:labelFor(key),type:fieldType(key,value)})):[];
  return NextResponse.json({fields});
}
