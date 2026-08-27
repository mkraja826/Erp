"use client";

import { FormEvent, useEffect, useState } from "react";
import { getStoredSession } from "../../../lib/auth-client";

type Props = { exercise: { id: string; title: string; instructions: string; exercise_type: string; max_score: number } };
type VerifyResult = { passed:boolean; score:number; percentage:number; feedback:string; hint:string|null; missingFields:string[]; saved?:boolean; lessonId?:string };
type CoachResult = { reply?:string; error?:string };
type UiField = { key:string; label:string; type:"text"|"number" };
type UiMeta = { mode:"form"|"ordered-list"|"single"; fields:UiField[]; items?:number };

export default function ExerciseCard({ exercise }: Props) {
  const [ui,setUi]=useState<UiMeta|null>(null);
  const [values,setValues]=useState<Record<string,string>>({});
  const [ordered,setOrdered]=useState<string[]>([]);
  const [single,setSingle]=useState("");
  const [result,setResult]=useState<VerifyResult|null>(null);
  const [loading,setLoading]=useState(false);
  const [hintLevel,setHintLevel]=useState(0);
  const [coachReply,setCoachReply]=useState("");

  useEffect(()=>{ fetch(`/api/exercise-ui?exerciseId=${exercise.id}`).then(r=>r.json()).then((data:UiMeta)=>{setUi(data);if(data.mode==="ordered-list")setOrdered(Array.from({length:data.items??4},()=>""));}); },[exercise.id]);

  function answerPayload():unknown{
    if(!ui)return {};
    if(ui.mode==="ordered-list")return ordered.map(v=>v.trim()).filter(Boolean);
    if(ui.mode==="single")return single.trim();
    return Object.fromEntries(ui.fields.map(field=>[field.key,field.type==="number"?Number(values[field.key]||0):(values[field.key]??"").trim()]));
  }

  async function callVerify(payload:Record<string,unknown>){
    const session=getStoredSession();
    const response=await fetch("/api/verify",{method:"POST",headers:{"Content-Type":"application/json",...(session?{Authorization:`Bearer ${session.access_token}`}:{})},body:JSON.stringify(payload)});
    return response.json() as Promise<VerifyResult>;
  }

  async function verify(event:FormEvent){
    event.preventDefault();setLoading(true);
    try{const data=await callVerify({exerciseId:exercise.id,answer:answerPayload()});setResult(data);if(data.passed&&data.lessonId)window.dispatchEvent(new CustomEvent("erp-lesson-completed",{detail:{lessonId:data.lessonId}}));}
    finally{setLoading(false);}
  }

  async function getHint(){
    const session=getStoredSession();if(!session){setCoachReply("Sign in to use the AI Coach and save your support history.");return;}
    const next=Math.min(hintLevel+1,3);setHintLevel(next);
    const response=await fetch("/api/coach",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({mode:"lesson",exerciseId:exercise.id,hintLevel:next,prompt:"I am stuck. Give me the next small hint without revealing the whole solution."})});
    const data=await response.json() as CoachResult;setCoachReply(data.reply??data.error??"Coach is unavailable right now.");
  }

  const hasInput=ui?.mode==="form"?ui.fields.some(f=>(values[f.key]??"").trim()):ui?.mode==="ordered-list"?ordered.some(Boolean):single.trim().length>0;

  return <section className="lessonExercise">
    <div className="lessonExerciseHeader"><span className="eyebrow">ERP Practice Workspace</span><span className="scorePill">{exercise.max_score} XP</span></div>
    <h3>{exercise.title}</h3><p>{exercise.instructions}</p>
    <form onSubmit={verify} className="erpWorkspace">
      <div className="erpWindowBar"><strong>{exercise.exercise_type==="transaction"?"Transaction Workspace":"Business Task"}</strong><span>Practice client · Safe mode</span></div>
      {!ui&&<p className="muted">Loading practice fields…</p>}
      {ui?.mode==="form"&&<div className="erpFieldGrid">{ui.fields.map(field=><label key={field.key}><span>{field.label}</span><input type={field.type} value={values[field.key]??""} onChange={e=>setValues(v=>({...v,[field.key]:e.target.value}))} /></label>)}</div>}
      {ui?.mode==="ordered-list"&&<div className="erpFieldGrid">{ordered.map((value,index)=><label key={index}><span>Step {index+1}</span><input value={value} onChange={e=>setOrdered(items=>items.map((x,i)=>i===index?e.target.value:x))} placeholder="Enter the business step" /></label>)}</div>}
      {ui?.mode==="single"&&<label className="erpSingle"><span>Answer</span><input value={single} onChange={e=>setSingle(e.target.value)} /></label>}
      <div className="erpActionBar"><button className="primaryButton" disabled={loading||!hasInput}>{loading?"Checking document…":"Check & Verify"}</button><button type="button" className="secondaryButton" onClick={getHint}>AI Coach · Hint {Math.min(hintLevel+1,3)}/3</button></div>
    </form>
    {coachReply&&<div className="coachNote"><p><strong>AI Coach:</strong> {coachReply}</p></div>}
    {result&&<div className={`verifyResult ${result.passed?"pass":"retry"}`}><strong>{result.passed?"Document verified":"Document needs correction"} · {result.percentage}%</strong><p>{result.feedback}</p>{result.missingFields.length>0&&<p>Check fields: {result.missingFields.join(", ")}</p>}{result.passed&&!result.saved&&<p>Sign in to save this verified progress.</p>}{result.passed&&result.saved&&<p>Progress saved. The next lesson is unlocked.</p>}</div>}
  </section>;
}
