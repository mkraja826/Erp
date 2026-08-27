"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { authenticatedFetch } from "../../../lib/auth-client";

type Incident={id:string;incident_type:string;title:string;description:string;priority:string;source_document_number:string|null;status:string;created_at:string};
type Attempt={id:string;incident_id:string;score:number;ai_help_count:number;result:string;created_at:string};
type Data={incidents:Incident[];attempts:Attempt[]};
type Result={passed:boolean;score:number;result:string;independenceScore:number;feedback:string};

export default function IncidentLabPage(){
  const [data,setData]=useState<Data|null>(null);const [selected,setSelected]=useState<Incident|null>(null);const [rootCause,setRootCause]=useState("");const [resolution,setResolution]=useState("");const [aiHelp,setAiHelp]=useState(0);const [result,setResult]=useState<Result|null>(null);const [message,setMessage]=useState("");
  useEffect(()=>{void load();},[]);
  async function load(){const response=await authenticatedFetch("/api/work-lab/incidents");if(response.status===403){setMessage("Incident Lab unlocks after SAP MM Level 1 completion.");return;}const payload=await response.json();if(!response.ok){setMessage(payload.error??"Unable to load incidents.");return;}setData(payload as Data);if(!selected&&(payload.incidents?.length??0)>0)setSelected(payload.incidents[0]);}
  async function submit(event:FormEvent){event.preventDefault();if(!selected)return;const response=await authenticatedFetch("/api/work-lab/incidents",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({incidentId:selected.id,rootCause,resolution,aiHelpCount:aiHelp})});const payload=await response.json();if(!response.ok){setMessage(payload.error??"Unable to submit investigation.");return;}setResult(payload as Result);setMessage("");await load();}
  async function askAssistant(){setAiHelp(n=>n+1);setMessage("Work assistant: start from the source document, follow predecessor/successor links, compare PO quantity/value with receipts and invoice status, then state the process break in your own words.");}
  const attempts=selected?(data?.attempts??[]).filter(a=>a.incident_id===selected.id):[];
  return <main className="dashboardPage">
    <header className="dashboardTopbar"><Link href="/work-lab" className="brandLink">ERP Edu · Incident Lab</Link><Link href="/work-lab" className="secondaryButton">Back to Work Lab</Link></header>
    <section className="dashboardHero"><div><span className="eyebrow">Support simulation</span><h1>Investigate the problem before you touch the process.</h1><p>These tickets are generated from your own ERP document history. Diagnose the root cause, prove it from the document chain, and recommend the right corrective action.</p></div></section>
    {message&&<div className="coachNote"><p>{message}</p></div>}
    <section className="dashboardGrid">
      <article className="dashboardCourseCard"><span className="eyebrow">Incident queue</span><h2>{data?.incidents.length??0} ticket(s)</h2><div className="flowDocumentList">{data?.incidents.map(i=><button key={i.id} type="button" className={selected?.id===i.id?"incidentRow active":"incidentRow"} onClick={()=>{setSelected(i);setRootCause("");setResolution("");setResult(null);}}><strong>{i.title}</strong><span>{i.priority} · {i.status}</span></button>)}{data&&data.incidents.length===0&&<p>No incidents yet. Create Procure-to-Pay documents, including a partial receipt or mismatched invoice, to generate investigation tickets.</p>}</div></article>
      <div className="dashboardStats"><article><strong>{data?.incidents.filter(i=>i.status==="open").length??0}</strong><span>Open incidents</span></article><article><strong>{data?.incidents.filter(i=>i.status==="resolved").length??0}</strong><span>Resolved</span></article><article><strong>{data?.attempts.length??0}</strong><span>Investigations</span></article><article><strong>{data?.attempts.filter(a=>a.result==="pass").length??0}</strong><span>Verified fixes</span></article></div>
    </section>
    {selected&&<section className="dashboardLowerGrid">
      <article className="nextStepCard"><span className="courseBadge">{selected.priority} · {selected.incident_type.replaceAll("_"," ")}</span><h2>{selected.title}</h2><p>{selected.description}</p>{selected.source_document_number&&<Link className="secondaryButton" href={`/documents/${selected.source_document_number}`}>Open source document</Link>}<p><strong>Previous attempts:</strong> {attempts.length}</p></article>
      <article className="nextStepCard"><span className="eyebrow">Your investigation</span><form onSubmit={submit} className="exerciseForm"><label><strong>Root cause</strong><textarea rows={4} value={rootCause} onChange={e=>setRootCause(e.target.value)} placeholder="What exactly broke in the business process?"/></label><label><strong>Corrective action</strong><textarea rows={4} value={resolution} onChange={e=>setResolution(e.target.value)} placeholder="What should the employee do next, and why?"/></label><div className="exerciseActions"><button className="primaryButton" disabled={!rootCause.trim()||!resolution.trim()}>Submit resolution</button><button className="secondaryButton" type="button" onClick={askAssistant}>Ask work assistant</button></div></form>{result&&<div className={`verifyResult ${result.passed?"pass":"retry"}`}><strong>{result.passed?"Incident resolved":"Investigation incomplete"} · {result.score}%</strong><p>{result.feedback}</p><p>Independence score: {result.independenceScore}%</p></div>}</article>
    </section>}
  </main>;
}
