"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { authenticatedFetch } from "../../../lib/auth-client";

type Item={key:string;kind:"work_ticket"|"exception";title:string;description:string;priority:"high"|"normal"|"low";dueAt:string;status:"open"|"acknowledged"|"completed";actionUrl:string;linkedDocument:string|null};
type Data={items:Item[];summary:{open:number;acknowledged:number;completed:number;exceptions:number}};

export default function WorkplaceInboxPage(){
 const [data,setData]=useState<Data|null>(null);
 const [message,setMessage]=useState("");
 const [busy,setBusy]=useState<string|null>(null);
 const [loading,setLoading]=useState(true);
 useEffect(()=>{void load();},[]);
 async function load(){
  setLoading(true);
  try{
   const r=await authenticatedFetch("/api/workplace-inbox");
   const p=await r.json();
   if(!r.ok){setMessage(p.error??"Unable to load workplace inbox.");setData(null);return;}
   setData(p as Data);setMessage("");
  }catch{setMessage("Unable to load workplace inbox. Check your connection and try again.");setData(null);}
  finally{setLoading(false);}
 }
 async function acknowledge(key:string){
  setBusy(key);setMessage("");
  try{
   const r=await authenticatedFetch("/api/workplace-inbox",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({itemKey:key})});
   const p=await r.json();
   if(!r.ok){setMessage(p.error??"Unable to acknowledge work item.");return;}
   setMessage("Work item acknowledged.");
   await load();
  }catch{setMessage("Unable to acknowledge work item. Try again.");}
  finally{setBusy(null);}
 }
 return <main className="dashboardPage"><header className="dashboardTopbar"><Link href="/dashboard" className="brandLink">ERP Edu · Workplace Inbox</Link><div className="courseTopActions"><Link href="/work-lab/manager-review" className="primaryButton">Manager Review</Link><Link href="/work-lab" className="secondaryButton">Work Lab</Link><Link href="/work-lab/incidents" className="secondaryButton">Incident Lab</Link></div></header><section className="dashboardHero" aria-labelledby="work-inbox-title"><div><span className="eyebrow">Phase 6D · simulated workday</span><h1 id="work-inbox-title">Your ERP work queue</h1><p>Prioritize normal transactions and exceptions the way an ERP user would during a real shift.</p></div></section>{loading&&<section className="statePanel" role="status" aria-live="polite"><h2>Loading workplace inbox…</h2><p>Your current work tickets and exceptions are being prepared.</p></section>}{message&&<section className="statePanel" role={data?"status":"alert"} aria-live="assertive"><h2>{message}</h2>{!data&&<button type="button" className="secondaryButton" onClick={()=>void load()}>Try again</button>}</section>}{data&&<><section className="dashboardStats" aria-label="Workplace inbox summary"><article><strong>{data.summary.open}</strong><span>Open</span></article><article><strong>{data.summary.acknowledged}</strong><span>Acknowledged</span></article><article><strong>{data.summary.exceptions}</strong><span>Exceptions</span></article><article><strong>{data.summary.completed}</strong><span>Completed</span></article></section>{data.items.length===0?<section className="statePanel" role="status"><h2>No work items right now</h2><p>Your queue is clear. New workplace tasks and exceptions will appear here when available.</p><Link className="primaryButton" href="/work-lab">Return to Work Lab</Link></section>:<section className="dashboardGrid" style={{gridTemplateColumns:"1fr"}} aria-label="Workplace queue">{data.items.map(item=><article className="dashboardCourseCard" key={item.key} data-inbox-item={item.key} aria-labelledby={`item-${item.key.replace(/[^a-zA-Z0-9]/g,"")}`}><span className="courseBadge">{item.priority.toUpperCase()} · {item.kind==="exception"?"Exception":"Work ticket"}</span><h2 id={`item-${item.key.replace(/[^a-zA-Z0-9]/g,"")}`}>{item.title}</h2><p>{item.description}</p><p><strong>Status:</strong> {item.status} · <strong>Due:</strong> {new Date(item.dueAt).toLocaleString()}{item.linkedDocument?<> · <strong>Document:</strong> {item.linkedDocument}</>:null}</p><div className="courseTopActions">{item.status==="open"&&<button className="secondaryButton" type="button" aria-label={`Acknowledge ${item.title}`} aria-busy={busy===item.key} disabled={busy===item.key} onClick={()=>void acknowledge(item.key)}>{busy===item.key?"Acknowledging…":"Acknowledge"}</button>}<Link className="primaryButton" href={item.actionUrl}>{item.status==="completed"?"Review":"Open work item"}</Link></div></article>)}</section>}</>}</main>;
}
