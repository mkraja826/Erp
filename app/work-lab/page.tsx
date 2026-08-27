"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { getStoredSession } from "../../lib/auth-client";

type Task = { id:string; title:string; description:string; task_type:string; difficulty:string };
type Attempt = { id:string; task_id:string; score:number; result:string; ai_help_count:number; started_at:string; completed_at:string|null };
type Data = { unlocked:boolean; tasks:Task[]; attempts:Attempt[] };

type Result = { passed:boolean; percentage:number; feedback:string; independenceScore:number };

export default function WorkLabPage() {
  const [data,setData] = useState<Data|null>(null);
  const [answer,setAnswer] = useState('{"document_type":"NB","vendor":"","material":"","quantity":0,"plant":"","purchasing_organization":""}');
  const [result,setResult] = useState<Result|null>(null);
  const [aiHelp,setAiHelp] = useState(0);
  const [message,setMessage] = useState("");

  useEffect(()=>{ void load(); },[]);

  async function load(){
    const session=getStoredSession();
    if(!session){window.location.href="/auth";return;}
    const response=await fetch("/api/work-lab",{headers:{Authorization:`Bearer ${session.access_token}`}});
    if(response.status===403){setMessage("Work Lab is locked until SAP MM Level 1 is 100% complete.");return;}
    const payload=await response.json();
    if(!response.ok){setMessage(payload.error ?? "Unable to load Work Lab.");return;}
    setData(payload as Data);
  }

  async function submit(event:FormEvent){
    event.preventDefault();
    const session=getStoredSession();
    const task=data?.tasks[0];
    if(!session||!task)return;
    let parsed:Record<string,unknown>={};
    try{parsed=JSON.parse(answer);}catch{setMessage("Enter the task result as valid JSON.");return;}
    const response=await fetch("/api/work-lab",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({taskId:task.id,answer:parsed,aiHelpCount:aiHelp})});
    const payload=await response.json();
    if(!response.ok){setMessage(payload.error ?? "Unable to verify task.");return;}
    setResult(payload as Result); setMessage(""); await load();
  }

  const task=data?.tasks[0];
  const taskAttempts=task ? (data?.attempts ?? []).filter((a)=>a.task_id===task.id) : [];

  return <main className="dashboardPage">
    <header className="dashboardTopbar"><Link href="/dashboard" className="brandLink">ERP Edu · Work Lab</Link><Link href="/dashboard" className="secondaryButton">Back to dashboard</Link></header>
    <section className="dashboardHero"><div><span className="eyebrow">Simulated SAP workplace</span><h1>Do the work, not another lesson.</h1><p>Guidance is reduced here. Your accuracy and independence become part of your work record.</p></div></section>
    {message && <article className="workGateCard locked"><h2>{message}</h2><Link className="primaryButton" href="/courses/sap-mm-level-1">Return to course</Link></article>}
    {task && <section className="dashboardGrid">
      <article className="dashboardCourseCard"><span className="courseBadge">{task.difficulty} · {task.task_type}</span><h2>{task.title}</h2><p>{task.description}</p><p><strong>Manager note:</strong> Complete the transaction correctly. Use the work assistant only if needed; assistance lowers your independence score.</p></article>
      <div className="dashboardStats"><article><strong>{taskAttempts.length}</strong><span>Attempts</span></article><article><strong>{taskAttempts[0]?.score ?? 0}%</strong><span>Latest accuracy</span></article><article><strong>{taskAttempts.reduce((s,a)=>s+a.ai_help_count,0)}</strong><span>AI assists</span></article><article><strong>{taskAttempts.some((a)=>a.result==="pass")?"Yes":"No"}</strong><span>Verified</span></article></div>
    </section>}
    {task && <section className="dashboardLowerGrid">
      <article className="nextStepCard"><span className="eyebrow">Your work</span><h2>Submit transaction state</h2><form onSubmit={submit} className="exerciseForm"><textarea rows={9} value={answer} onChange={(e)=>setAnswer(e.target.value)} /><div className="exerciseActions"><button className="primaryButton">Verify work ticket</button><button type="button" className="secondaryButton" onClick={()=>{setAiHelp((n)=>n+1);setMessage("Work assistant: compare the ticket with your document type, vendor, material, quantity, plant and purchasing organization. I won’t reveal the final values.");}}>Ask work assistant</button></div></form></article>
      <article className={`workGateCard ${result?.passed?"unlocked":"locked"}`}><span className="eyebrow">Performance</span><h2>{result?`${result.percentage}% accuracy`:"Awaiting submission"}</h2><p>{result?.feedback ?? "Submit the ticket to create your first verified Work Lab record."}</p>{result && <span className="workGateStatus">Independence score: {result.independenceScore}%</span>}</article>
    </section>}
  </main>;
}