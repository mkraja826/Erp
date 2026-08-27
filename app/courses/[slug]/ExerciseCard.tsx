"use client";

import { FormEvent, useEffect, useState } from "react";
import { authenticatedFetch } from "../../../lib/auth-client";

type Props = { exercise: { id: string; title: string; instructions: string; exercise_type: string; max_score: number } };
type VerifyResult = { passed:boolean; score:number; percentage:number; feedback:string; hint:string|null; missingFields:string[]; saved?:boolean; lessonId?:string };
type CoachResult = { reply?:string; error?:string };
type UiField = { key:string; label:string; type:"text"|"number" };
type UiMeta = { mode:"form"|"ordered-list"|"single"|"multiple-choice"; fields:UiField[]; items?:number; options?:string[] };

export default function ExerciseCard({ exercise }: Props) {
  const [ui,setUi]=useState<UiMeta|null>(null);const [values,setValues]=useState<Record<string,string>>({});const [ordered,setOrdered]=useState<string[]>([]);const [single,setSingle]=useState("");const [result,setResult]=useState<VerifyResult|null>(null);const [loading,setLoading]=useState(false);const [hintLevel,setHintLevel]=useState(0);const [coachReply,setCoachReply]=useState("");
  useEffect(()=>{fetch(`/api/exercise-ui?exerciseId=${exercise.id}`).then(r=>r.json()).then((data:UiMeta)=>{setUi(data);if(data.mode==="ordered-list")setOrdered(Array.from({length:data.items??4},()=>""));});},[exercise.id]);
  function answerPayload():unknown{if(!ui)return {};if(ui.mode==="ordered-list")return ordered.map(v=>v.trim()).filter(Boolean);if(ui.mode==="single"||ui.mode==="multiple-choice")return single.trim();return Object.fromEntries(ui.fields.map(field=>[field.key,field.type==="number"?Number(values[field.key]||0):(values[field.key]??"").trim()]));}
  async function verify(event:FormEvent){event.preventDefault();setLoading(true);try{const response=await authenticatedFetch("/api/verify",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({exerciseId:exercise.id,answer:answerPayload()})});if(!response)return;const data=await response.json() as VerifyResult;setResult(data);if(data.passed&&data.lessonId)window.dispatchEvent(new CustomEvent("erp-lesson-completed",{detail:{lessonId:data.lessonId}}));}finally{setLoading(false);}}
  async function getHint(){const next=Math.min(hintLevel+1,3);setHintLevel(next);const response=await authenticatedFetch("/api/coach",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({mode:"lesson",exerciseId:exercise.id,hintLevel:next,prompt:"Explain one small clue in beginner-friendly language. Do not reveal the answer."})});if(!response)return;const data=await response.json() as CoachResult;setCoachReply(data.reply??data.error??"Coach is unavailable right now.");}
  const hasInput=ui?.mode==="form"?ui.fields.some(f=>(values[f.key]??"").trim()):ui?.mode==="ordered-list"?ordered.some(Boolean):single.trim().length>0;
  return <section className="lessonExercise">
    <div className="lessonExerciseHeader"><span className="eyebrow">Quick Check</span><span className="scorePill">{exercise.max_score} XP</span></div>
    <h3>{exercise.title}</h3><p>{exercise.instructions}</p>
    <form onSubmit={verify} className="beginnerQuestion">
      {!ui&&<p className="muted">Loading question…</p>}
      {ui?.mode==="multiple-choice"&&<fieldset className="choiceGroup"><legend>Choose one answer</legend>{ui.options?.map(option=><label key={option} className={single===option?"choiceCard selected":"choiceCard"}><input type="radio" name={`exercise-${exercise.id}`} value={option} checked={single===option} onChange={e=>setSingle(e.target.value)}/><span>{option}</span></label>)}</fieldset>}
      {ui?.mode==="single"&&<label className="erpSingle"><span>Type a short answer</span><input value={single} onChange={e=>setSingle(e.target.value)} placeholder="One word or short answer" autoComplete="off"/></label>}
      {ui?.mode==="ordered-list"&&<div className="erpFieldGrid">{ordered.map((value,index)=><label key={index}><span>Step {index+1}</span><input value={value} onChange={e=>setOrdered(items=>items.map((x,i)=>i===index?e.target.value:x))}/></label>)}</div>}
      {ui?.mode==="form"&&<div className="erpFieldGrid">{ui.fields.map(field=><label key={field.key}><span>{field.label}</span><input type={field.type} value={values[field.key]??""} onChange={e=>setValues(v=>({...v,[field.key]:e.target.value}))}/></label>)}</div>}
      <div className="exerciseActions"><button className="primaryButton" disabled={loading||!hasInput}>{loading?"Checking…":"Check answer"}</button><button type="button" className="secondaryButton" onClick={getHint}>Need a hint?</button></div>
    </form>
    {coachReply&&<div className="coachNote" aria-live="polite"><p><strong>Hint:</strong> {coachReply}</p></div>}
    {result&&<div className={`verifyResult ${result.passed?"pass":"retry"}`} aria-live="polite"><strong>{result.passed?"Correct — well done!":"Not quite — try again"}</strong><p>{result.feedback}</p>{result.passed&&result.saved&&<p>Lesson complete. Your progress is saved and the next lesson is unlocked.</p>}</div>}
  </section>;
}
