"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { authenticatedFetch } from "../../../lib/auth-client";

type Review={profileDocument:string;overall:number;level:string;readinessBand:string;jobReady:boolean;recommendation:string;skills:Record<string,number>;evidence:Record<string,number>;certificates:Array<{certificate_type:string;verification_code:string;score:number;issued_at:string}>;documentNumber?:string;saved?:boolean};

export default function ManagerReviewPage(){
 const[data,setData]=useState<Review|null>(null);
 const[message,setMessage]=useState("");
 const[error,setError]=useState("");
 const[loading,setLoading]=useState(true);
 const[saving,setSaving]=useState(false);
 useEffect(()=>{void load();},[]);
 async function load(){
  setLoading(true);setError("");
  try{
   const r=await authenticatedFetch("/api/manager-review");
   const j=await r.json();
   if(!r.ok){setError(j.error??"Unable to load review.");setData(null);return;}
   setData(j as Review);
  }catch{setError("Unable to load manager review. Check your connection and try again.");setData(null);}
  finally{setLoading(false);}
 }
 async function save(){
  setSaving(true);setMessage("");setError("");
  try{
   const r=await authenticatedFetch("/api/manager-review",{method:"POST"});
   const j=await r.json();
   if(!r.ok){setError(j.error??"Unable to save review.");return;}
   setData(j as Review);setMessage(`Manager review saved as ${j.documentNumber}.`);
  }catch{setError("Unable to save manager review. Try again.");}
  finally{setSaving(false);}
 }
 return <main className="dashboardPage"><header className="dashboardTopbar"><Link href="/dashboard" className="brandLink">ERP Edu · Manager Review</Link><div className="courseTopActions"><Link href="/work-lab/inbox" className="secondaryButton">Work inbox</Link><Link href="/dashboard" className="secondaryButton">Dashboard</Link></div></header><section className="dashboardHero"><div><span className="eyebrow">Employability evidence</span><h1>Manager-ready learner review.</h1><p>A consolidated view of verified workplace performance, independence, exception handling and readiness evidence.</p></div></section>{loading&&<section className="statePanel" role="status" aria-live="polite"><h2>Loading manager review…</h2><p>Your verified workplace evidence is being consolidated.</p></section>}{error&&<section className="statePanel" role="alert" aria-live="assertive"><h2>{error}</h2>{!data&&<button type="button" className="secondaryButton" onClick={()=>void load()}>Try again</button>}</section>}{message&&<section className="statePanel" role="status" aria-live="polite"><h2>{message}</h2></section>}{data&&<><section className="dashboardGrid"><article className="dashboardCourseCard"><span className="courseBadge">{data.readinessBand.replaceAll("_"," ")}</span><h2>{data.level}</h2><p><strong>Recommendation:</strong> {data.recommendation.replaceAll("_"," ")}</p><p>Competency profile: {data.profileDocument}</p></article><div className="dashboardStats"><article><strong>{data.overall}%</strong><span>Overall</span></article><article><strong>{data.evidence.workPassed??0}</strong><span>Work tickets passed</span></article><article><strong>{data.evidence.incidentsResolved??0}</strong><span>Incidents resolved</span></article><article><strong>{data.evidence.inboxAcknowledgements??0}</strong><span>Inbox triage events</span></article></div></section><section className="dashboardLowerGrid"><article className="nextStepCard"><span className="eyebrow">Verified skill dimensions</span><h2>Evidence summary</h2><div className="dashboardStats">{Object.entries(data.skills).map(([k,v])=><article key={k}><strong>{v}%</strong><span>{k.replaceAll(/([A-Z])/g," $1")}</span></article>)}</div></article><article className="workGateCard"><span className="eyebrow">Manager evidence record</span><h2>{data.documentNumber?data.documentNumber:"Live review"}</h2><p>Freeze the current evidence into one durable learner-owned review record for audit or hiring discussion.</p><button className="primaryButton" type="button" aria-busy={saving} disabled={saving} onClick={()=>void save()}>{saving?"Saving…":"Save manager review"}</button></article></section>{data.certificates.length>0&&<section className="nextStepCard"><span className="eyebrow">Public credentials</span><h2>Certificates</h2>{data.certificates.map(c=><p key={c.verification_code}><strong>{c.certificate_type}</strong> · {c.score}% · {c.verification_code}</p>)}</section>}</>}</main>;
}
