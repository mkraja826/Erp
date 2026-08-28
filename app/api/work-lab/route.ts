import { NextResponse } from "next/server";
import { getSupabaseUser, supabaseRest } from "../../../lib/supabase";

type Task = { id:string; course_id:string; title:string; description:string; task_type:string; difficulty:string; expected_state:{ expected?:Record<string,unknown> } };
type Enrollment = { status:string; progress_percent:number };
type Attempt = { id:string; task_id:string; score:number; result:string; ai_help_count:number; started_at:string; completed_at:string|null };

function normalize(v: unknown): unknown {
  if (typeof v === "string") return v.trim().toLowerCase();
  if (Array.isArray(v)) return v.map(normalize);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>[k,normalize(x)]));
  return v;
}

function score(expected: Record<string,unknown>, answer: Record<string,unknown>) {
  const e = normalize(expected) as Record<string,unknown>;
  const a = normalize(answer) as Record<string,unknown>;
  const keys = Object.keys(e);
  const correct = keys.filter((k)=>JSON.stringify(e[k])===JSON.stringify(a[k])).length;
  return Math.round((correct / Math.max(keys.length,1))*100);
}

async function context(request: Request) {
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : undefined;
  if (!token) return null;
  const user = await getSupabaseUser(token);
  if (!user) return null;
  const courses = await supabaseRest<{id:string}[]>("courses?slug=eq.sap-mm-level-1&select=id&limit=1",{},token);
  const course = courses[0];
  if (!course) return null;
  const enrollments = await supabaseRest<Enrollment[]>(`enrollments?user_id=eq.${user.id}&course_id=eq.${course.id}&select=status,progress_percent&limit=1`,{},token);
  return { token,user,course,enrollment:enrollments[0] };
}

export async function GET(request: Request) {
  const ctx = await context(request);
  if (!ctx) return NextResponse.json({authenticated:false},{status:401});
  const unlocked = ctx.enrollment?.status === "completed" && Number(ctx.enrollment.progress_percent) >= 100;
  if (!unlocked) return NextResponse.json({authenticated:true,unlocked:false},{status:403});
  const tasks = await supabaseRest<Task[]>(`work_lab_tasks?course_id=eq.${ctx.course.id}&is_published=eq.true&select=id,course_id,title,description,task_type,difficulty,expected_state&order=created_at.asc`,{},ctx.token);
  const attempts = await supabaseRest<Attempt[]>(`work_lab_attempts?user_id=eq.${ctx.user.id}&select=id,task_id,score,result,ai_help_count,started_at,completed_at&order=started_at.desc`,{},ctx.token);
  return NextResponse.json({authenticated:true,unlocked:true,tasks:tasks.map(({expected_state,...task})=>task),attempts});
}

export async function POST(request: Request) {
  const ctx = await context(request);
  if (!ctx) return NextResponse.json({authenticated:false},{status:401});
  const unlocked = ctx.enrollment?.status === "completed" && Number(ctx.enrollment.progress_percent) >= 100;
  if (!unlocked) return NextResponse.json({error:"Work Lab locked"},{status:403});
  const body = await request.json() as { taskId?:string; answer?:Record<string,unknown>; aiHelpCount?:number };
  if (!body.taskId) return NextResponse.json({error:"taskId is required"},{status:400});
  const tasks = await supabaseRest<Task[]>(`work_lab_tasks?id=eq.${body.taskId}&course_id=eq.${ctx.course.id}&is_published=eq.true&select=id,course_id,title,description,task_type,difficulty,expected_state&limit=1`,{},ctx.token);
  const task = tasks[0];
  if (!task) return NextResponse.json({error:"Task not found"},{status:404});
  const percentage = score(task.expected_state.expected ?? {}, body.answer ?? {});
  const passed = percentage >= 80;
  const created = await supabaseRest<Attempt[]>("work_lab_attempts",{method:"POST",headers:{Prefer:"return=representation"},body:JSON.stringify({user_id:ctx.user.id,task_id:task.id,submitted_state:body.answer ?? {},score:percentage,result:passed?"pass":percentage>0?"partial":"fail",ai_help_count:Math.max(0,body.aiHelpCount ?? 0),completed_at:new Date().toISOString()})},ctx.token);
  const attemptId = created[0]?.id;
  if (attemptId) {
    await supabaseRest("rpc/record_competency_evidence_from_source",{method:"POST",body:JSON.stringify({p_source_type:"work_lab",p_source_id:attemptId,p_skill_key:"independent_sap_mm_work"})},ctx.token);
  }
  return NextResponse.json({passed,percentage,feedback:passed?"Work ticket verified. This task is now part of your work history.":"Not verified yet. Re-check the ticket details and submit again.",independenceScore:Math.max(0,100-Math.min(100,(body.aiHelpCount ?? 0)*20))});
}