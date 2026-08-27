"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getStoredSession } from "../../lib/auth-client";

type Doc = { document_number:string; document_type:string; status:string; header:Record<string,unknown>; items:Array<Record<string,unknown>>; created_at:string };
type FlowData = { stages:{ requisition:Doc[]; purchaseOrders:Doc[]; goodsReceipts:Doc[]; invoices:Doc[] } };
type Runtime = { masterData:Array<{entity_type:string;code:string;name:string}> };
type Action = "create_pr"|"create_po"|"post_gr"|"post_invoice";

export default function ProcurementFlowPage(){
  const [flow,setFlow]=useState<FlowData|null>(null);
  const [runtime,setRuntime]=useState<Runtime|null>(null);
  const [active,setActive]=useState<Action>("create_pr");
  const [values,setValues]=useState<Record<string,string>>({});
  const [message,setMessage]=useState("");
  const [posting,setPosting]=useState(false);

  useEffect(()=>{void load();},[]);
  async function authFetch(path:string,init:RequestInit={}){const session=getStoredSession();if(!session){window.location.href="/auth";throw new Error("No session");}return fetch(path,{...init,headers:{...(init.headers??{}),Authorization:`Bearer ${session.access_token}`}});}
  async function load(){const [a,b]=await Promise.all([authFetch("/api/procurement-flow"),authFetch("/api/erp-runtime")]);if(a.status===401||b.status===401){window.location.href="/auth";return;}setFlow(await a.json());setRuntime(await b.json());}
  const master=(type:string)=>runtime?.masterData.filter(x=>x.entity_type===type)??[];
  const prs=flow?.stages.requisition??[];const pos=flow?.stages.purchaseOrders??[];const grs=flow?.stages.goodsReceipts??[];const ivs=flow?.stages.invoices??[];
  const steps=useMemo(()=>[
    {key:"create_pr" as Action,label:"1. Requisition",done:prs.length>0},
    {key:"create_po" as Action,label:"2. Purchase Order",done:pos.length>0},
    {key:"post_gr" as Action,label:"3. Goods Receipt",done:grs.length>0},
    {key:"post_invoice" as Action,label:"4. Invoice",done:ivs.some(x=>x.status==="posted")},
  ],[prs.length,pos.length,grs.length,ivs]);

  async function post(){setPosting(true);setMessage("");try{const response=await authFetch("/api/procurement-flow",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:active,data:values})});const payload=await response.json();if(!response.ok){setMessage(payload.error??"Unable to post document.");return;}setMessage(`${payload.documentNumber} posted${payload.matchStatus?` · ${payload.matchStatus}`:""}.`);setValues({});await load();if(payload.next)setActive(payload.next);}finally{setPosting(false);}}

  function select(label:string,key:string,options:Array<{value:string;text:string}>){return <label><span>{label}</span><select value={values[key]??""} onChange={e=>setValues(v=>({...v,[key]:e.target.value}))}><option value="">Select…</option>{options.map(o=><option value={o.value} key={o.value}>{o.text}</option>)}</select></label>}
  function input(label:string,key:string,type="text"){return <label><span>{label}</span><input type={type} value={values[key]??""} onChange={e=>setValues(v=>({...v,[key]:e.target.value}))}/></label>}

  return <main className="dashboardPage">
    <header className="dashboardTopbar"><Link className="brandLink" href="/dashboard">ERP Edu · Procure-to-Pay</Link><Link href="/dashboard" className="secondaryButton">Dashboard</Link></header>
    <section className="dashboardHero"><div><span className="eyebrow">Linked document simulation</span><h1>One business process. Four connected documents.</h1><p>Create each document from the one before it. Your own posted documents become the source data for the next transaction.</p></div></section>

    <div className="flowStepper">{steps.map(step=><button key={step.key} className={`${active===step.key?"active":""} ${step.done?"done":""}`} onClick={()=>setActive(step.key)}><span>{step.done?"✓":"○"}</span>{step.label}</button>)}</div>

    <section className="dashboardGrid">
      <article className="dashboardCourseCard">
        <span className="courseBadge">{active.replaceAll("_"," ")}</span>
        <h2>{active==="create_pr"?"Create purchase requisition":active==="create_po"?"Convert PR to purchase order":active==="post_gr"?"Receive against purchase order":"Verify supplier invoice"}</h2>
        <div className="erpFieldGrid">
          {active==="create_pr"&&<>{select("Material","material",master("material").map(x=>({value:x.code,text:`${x.code} · ${x.name}`})))}{select("Plant","plant",master("plant").map(x=>({value:x.code,text:`${x.code} · ${x.name}`})))}{input("Quantity","quantity","number")}</>}
          {active==="create_po"&&<>{select("Source Purchase Requisition","source_pr",prs.map(x=>({value:x.document_number,text:x.document_number})))}{select("Vendor","vendor",master("vendor").map(x=>({value:x.code,text:`${x.code} · ${x.name}`})))}{select("Purchasing Organization","purchasing_organization",master("purchasing_organization").map(x=>({value:x.code,text:`${x.code} · ${x.name}`})))}{input("Unit Price","unit_price","number")}</>}
          {active==="post_gr"&&<>{select("Source Purchase Order","source_po",pos.map(x=>({value:x.document_number,text:x.document_number})))}{select("Storage Location","storage_location",master("storage_location").map(x=>({value:x.code,text:`${x.code} · ${x.name}`})))}{input("Received Quantity","received_quantity","number")}</>}
          {active==="post_invoice"&&<>{select("Source Purchase Order","source_po",pos.map(x=>({value:x.document_number,text:x.document_number})))}{input("Supplier Invoice Value","invoice_value","number")}</>}
        </div>
        <div className="erpActionBar"><button className="primaryButton" onClick={post} disabled={posting}>{posting?"Posting…":"Post document"}</button></div>
        {message&&<div className="erpStatusBar ready">{message}</div>}
      </article>

      <div className="dashboardStats"><article><strong>{prs.length}</strong><span>Requisitions</span></article><article><strong>{pos.length}</strong><span>Purchase orders</span></article><article><strong>{grs.length}</strong><span>Goods receipts</span></article><article><strong>{ivs.length}</strong><span>Invoices</span></article></div>
    </section>

    <section className="dashboardLowerGrid">
      <article className="nextStepCard"><span className="eyebrow">Document chain</span><h2>Your posted history</h2><div className="flowDocumentList">{[...prs,...pos,...grs,...ivs].map(d=><div key={d.document_number}><strong>{d.document_number}</strong><span>{d.document_type} · {d.status}</span></div>)}{!prs.length&&!pos.length&&!grs.length&&!ivs.length&&<p>No linked documents yet. Start with a purchase requisition.</p>}</div></article>
      <article className="workGateCard unlocked"><span className="eyebrow">Process logic</span><h2>{ivs.some(x=>x.status==="posted")?"Procure-to-pay cycle completed":"Build the chain in order"}</h2><p>PR captures the internal need. PO commits to a supplier. GR records what physically arrived and updates inventory. Invoice verification compares the supplier bill with what was ordered and received.</p></article>
    </section>
  </main>;
}
