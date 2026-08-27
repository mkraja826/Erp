import { NextResponse } from "next/server";
import { getSupabaseUser, supabaseRest } from "../../../lib/supabase";

type Mode = "lesson" | "work";
type Body = { mode?: Mode; lessonId?: string; exerciseId?: string; taskId?: string; prompt?: string; hintLevel?: number };
type LessonRow = { id:string; title:string; summary:string|null; content:Record<string,unknown> };
type ExerciseRow = { id:string; lesson_id:string; title:string; instructions:string; expected_state:{ hints?:string[] } };
type TaskRow = { id:string; title:string; description:string; expected_state:Record<string,unknown> };

function safePrompt(value:string|undefined){ return (value ?? "Help me understand what to do next.").trim().slice(0,1200); }

async function modelReply(system:string,user:string){
  const endpoint=process.env.AI_PROVIDER_URL;
  const apiKey=process.env.AI_PROVIDER_API_KEY;
  const model=process.env.AI_PROVIDER_MODEL;
  if(!endpoint || !apiKey || !model) return null;
  try{
    const response=await fetch(endpoint,{method:"POST",headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},body:JSON.stringify({model,messages:[{role:"system",content:system},{role:"user",content:user}],temperature:0.3})});
    if(!response.ok) return null;
    const data=await response.json() as { choices?:Array<{message?:{content?:string}}> };
    return data.choices?.[0]?.message?.content?.trim().slice(0,1800) || null;
  }catch{return null;}
}

export async function POST(request:Request){
  const authorization=request.headers.get("authorization");
  const accessToken=authorization?.startsWith("Bearer ") ? authorization.slice(7) : undefined;
  if(!accessToken) return NextResponse.json({error:"Sign in to use AI Coach."},{status:401});
  const user=await getSupabaseUser(accessToken);
  if(!user) return NextResponse.json({error:"Session expired."},{status:401});

  const body=await request.json() as Body;
  const mode=body.mode ?? "lesson";
  const prompt=safePrompt(body.prompt);
  let lessonId:string|null=body.lessonId ?? null;
  let exerciseId:string|null=body.exerciseId ?? null;
  let context="";
  let fallback="";
  let hintLevel=Math.max(1,Math.min(body.hintLevel ?? 1,3));

  if(mode==="lesson"){
    if(body.exerciseId){
      const rows=await supabaseRest<ExerciseRow[]>(`exercises?id=eq.${body.exerciseId}&select=id,lesson_id,title,instructions,expected_state&limit=1`,{},accessToken);
      const exercise=rows[0];
      if(!exercise) return NextResponse.json({error:"Exercise not found."},{status:404});
      lessonId=exercise.lesson_id; exerciseId=exercise.id;
      const lessonRows=await supabaseRest<LessonRow[]>(`lessons?id=eq.${exercise.lesson_id}&select=id,title,summary,content&limit=1`,{},accessToken);
      const lesson=lessonRows[0];
      context=`Lesson: ${lesson?.title ?? "SAP lesson"}\nLesson context: ${JSON.stringify(lesson?.content ?? {})}\nExercise: ${exercise.title}\nInstructions: ${exercise.instructions}`;
      const hints=exercise.expected_state?.hints ?? [];
      fallback=hints[Math.min(hintLevel-1,Math.max(hints.length-1,0))] ?? `Focus on the business meaning of the fields in the task. Check one field at a time and retry.`;
    }else if(body.lessonId){
      const rows=await supabaseRest<LessonRow[]>(`lessons?id=eq.${body.lessonId}&select=id,title,summary,content&limit=1`,{},accessToken);
      const lesson=rows[0];
      if(!lesson) return NextResponse.json({error:"Lesson not found."},{status:404});
      lessonId=lesson.id;
      context=`Lesson: ${lesson.title}\nSummary: ${lesson.summary ?? ""}\nContent: ${JSON.stringify(lesson.content)}`;
      fallback=`Think about ${lesson.title} as a real business process first, then map that idea to SAP. Tell me which sentence or term is confusing and I’ll simplify only that part.`;
    }else return NextResponse.json({error:"lessonId or exerciseId is required."},{status:400});
  }else{
    if(!body.taskId) return NextResponse.json({error:"taskId is required."},{status:400});
    const rows=await supabaseRest<TaskRow[]>(`work_lab_tasks?id=eq.${body.taskId}&is_published=eq.true&select=id,title,description,expected_state&limit=1`,{},accessToken);
    const task=rows[0];
    if(!task) return NextResponse.json({error:"Work task not found."},{status:404});
    context=`Work ticket: ${task.title}\nBusiness request: ${task.description}`;
    fallback="Treat this like a real junior SAP ticket: extract the requested document type, supplier, material, quantity, plant, and purchasing organization from the business request. Check your transaction against those categories. I will not reveal the final values.";
  }

  const system=mode==="work"
    ? "You are ERP Edu's SAP work assistant. Help a junior employee investigate without giving final transaction values or completing the ticket. Be concise, practical, and ask them to inspect one thing at a time."
    : `You are ERP Edu's patient SAP learning coach for an average beginner. Explain simply, avoid jargon, keep the learner moving, and never overwhelm them. This is hint level ${hintLevel}/3: level 1 is a nudge, level 2 explains the idea, level 3 may give a guided procedure but should still encourage the learner to act.`;
  const generated=await modelReply(system,`${context}\n\nLearner asks: ${prompt}`);
  const reply=generated ?? fallback;

  await supabaseRest("ai_help_events",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({user_id:user.id,lesson_id:lessonId,exercise_id:exerciseId,hint_level:hintLevel,prompt,response_summary:reply.slice(0,500)})},accessToken);

  return NextResponse.json({reply,hintLevel,source:generated?"model":"guided-fallback"});
}
