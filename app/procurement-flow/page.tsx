"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import ErpTrainingShell, { type SimulationMode } from "../../components/ErpTrainingShell";
import { authenticatedFetch } from "../../lib/auth-client";
import styles from "./ProcurementFlow.module.css";

type Doc = { document_number:string; document_type:string; status:string; header:Record<string,unknown>; items:Array<Record<string,unknown>>; created_at:string };
type FlowData = { stages:{ requisition:Doc[]; purchaseOrders:Doc[]; goodsReceipts:Doc[]; invoices:Doc[] } };
type Runtime = { masterData:Array<{entity_type:string;code:string;name:string}> };
type Action = "create_pr"|"create_po"|"post_gr"|"post_invoice";

const labels:Record<Action,{title:string;transaction:string;type:string;description:string}>={
  create_pr:{title:"Create Purchase Requisition",transaction:"Purchase Requisition",type:"PR",description:"Capture an internal material requirement before a supplier order is created."},
  create_po:{title:"Create Purchase Order",transaction:"Purchase Order",type:"PO",description:"Convert an approved requirement into an official supplier commitment."},
  post_gr:{title:"Post Goods Receipt",transaction:"Goods Receipt",type:"GR",description:"Record the material quantity that physically arrived against the purchase order."},
  post_invoice:{title:"Verify Supplier Invoice",transaction:"Invoice Verification",type:"IV",description:"Compare the supplier invoice with the purchase order and received quantity before posting."},
};
const modeCopy:Record<SimulationMode,{label:string;summary:string}>={
  guided:{label:"Guided",summary:"Full step-by-step coaching and field guidance."},
  assisted:{label:"Assisted",summary:"Business context remains, but step-by-step prompts are reduced."},
  workplace:{label:"Workplace",summary:"Operate independently with normal ERP validation only."},
};

export default function ProcurementFlowPage(){
  const [flow,setFlow]=useState<FlowData|null>(null);
  const [runtime,setRuntime]=useState<Runtime|null>(null);
  const [active,setActive]=useState<Action>("create_pr");
  const [mode,setMode]=useState<SimulationMode>("guided");
  const [values,setValues]=useState<Record<string,string>>({});
  const [message,setMessage]=useState("");
  const [posting,setPosting]=useState(false);
  const [lastSuccess,setLastSuccess]=useState(false);

  useEffect(()=>{void load();},[]);
  async function load(){const [a,b]=await Promise.all([authenticatedFetch("/api/procurement-flow"),authenticatedFetch("/api/erp-runtime")]);if(!a||!b)return;setFlow(await a.json());setRuntime(await b.json());}
  const master=(type:string)=>runtime?.masterData.filter(x=>x.entity_type===type)??[];
  const prs=flow?.stages.requisition??[];const pos=flow?.stages.purchaseOrders??[];const grs=flow?.stages.goodsReceipts??[];const ivs=flow?.stages.invoices??[];
  const availablePrs=prs.filter(x=>x.status==="open"||x.status==="posted");
  const availablePos=pos.filter(x=>x.status!=="closed");
  const steps=useMemo(()=>[
    {key:"create_pr" as Action,label:"1. Requisition",done:prs.length>0},
    {key:"create_po" as Action,label:"2. Purchase Order",done:pos.length>0},
    {key:"post_gr" as Action,label:"3. Goods Receipt",done:grs.length>0},
    {key:"post_invoice" as Action,label:"4. Invoice",done:ivs.some(x=>x.status==="posted")},
  ],[prs.length,pos.length,grs.length,ivs]);

  const required:Record<Action,string[]>={create_pr:["material","plant","quantity"],create_po:["source_pr","vendor","purchasing_organization","unit_price"],post_gr:["source_po","storage_location","received_quantity"],post_invoice:["source_po","invoice_value"]};
  const ready=required[active].every(key=>(values[key]??"").trim().length>0);
  const sourceDoc=active==="create_po"?prs.find(x=>x.document_number===values.source_pr):active==="post_gr"||active==="post_invoice"?pos.find(x=>x.document_number===values.source_po):undefined;

  async function post(){if(!ready)return;setPosting(true);setMessage("");setLastSuccess(false);try{const response=await authenticatedFetch("/api/procurement-flow",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:active,data:values})});if(!response)return;const payload=await response.json();if(!response.ok){setMessage(payload.error??"Unable to post document.");return;}setMessage(`${payload.documentNumber} posted${payload.matchStatus?` · ${payload.matchStatus}`:""}.`);setLastSuccess(true);setValues({});await load();if(payload.next)setActive(payload.next);}finally{setPosting(false);}}

  const showFieldHints=mode==="guided";
  function select(label:string,key:string,options:Array<{value:string;text:string}>,hint:string){return <label className={styles.field}><span className={styles.fieldLabel}>{label}<b className={styles.required}>*</b></span><select value={values[key]??""} onChange={e=>{setValues(v=>({...v,[key]:e.target.value}));setLastSuccess(false);setMessage("");}}><option value="">Select value…</option>{options.map(o=><option value={o.value} key={o.value}>{o.text}</option>)}</select>{showFieldHints&&<small className={styles.fieldHint}>{hint}</small>}</label>}
  function input(label:string,key:string,type="text",hint="Required business value"){return <label className={styles.field}><span className={styles.fieldLabel}>{label}<b className={styles.required}>*</b></span><input type={type} min={type==="number"?0:undefined} value={values[key]??""} onChange={e=>{setValues(v=>({...v,[key]:e.target.value}));setLastSuccess(false);setMessage("");}}/>{showFieldHints&&<small className={styles.fieldHint}>{hint}</small>}</label>}

  const current=labels[active];
  const shellStatus=posting?"checking":lastSuccess?"success":message?"warning":"ready";
  const itemMaterial=values.material||String(sourceDoc?.items?.[0]?.material??"—");
  const itemQty=values.quantity||values.received_quantity||String(sourceDoc?.items?.[0]?.quantity??"—");
  const actionPrompt=mode==="guided"?(ready?"Required fields complete — document is ready for posting.":"Complete all required fields marked with *."):mode==="assisted"?(ready?"Ready to post.":"Complete required business data."):"";

  return <main className="dashboardPage">
    <header className="dashboardTopbar"><Link className="brandLink" href="/dashboard">ERP Edu · Procure-to-Pay</Link><Link href="/dashboard" className="secondaryButton">Dashboard</Link></header>
    <section className="dashboardHero"><div><span className="eyebrow">Enterprise process simulation</span><h1>Run a complete procure-to-pay cycle.</h1><p>Work through connected business documents in the same order an MM user would handle them in a company.</p></div></section>

    <div className="flowStepper" aria-label="Simulation mode">{(["guided","assisted","workplace"] as SimulationMode[]).map(x=><button key={x} className={mode===x?"active":""} onClick={()=>{setMode(x);setMessage("");setLastSuccess(false);}}><span>{mode===x?"●":"○"}</span>{modeCopy[x].label}</button>)}</div>
    <p style={{margin:"-6px 0 18px",fontSize:12,color:"#667085"}}>{modeCopy[mode].summary}</p>

    <div className="flowStepper">{steps.map(step=><button key={step.key} className={`${active===step.key?"active":""} ${step.done?"done":""}`} onClick={()=>{setActive(step.key);setValues({});setMessage("");setLastSuccess(false);}}><span>{step.done?"✓":"○"}</span>{step.label}</button>)}</div>

    <ErpTrainingShell title={current.title} transactionLabel={current.transaction} modeLabel="MM Operations Client" simulationMode={mode} status={shellStatus} actions={<>{actionPrompt&&<span className={styles.actionHelp}>{actionPrompt}</span>}<button className={styles.postButton} onClick={post} disabled={posting||!ready}>{posting?"Posting document…":active==="post_invoice"?"Verify & Post":"Post document"}</button></>}>
      <div className={styles.transactionWorkspace}>
        <div className={styles.documentIntro}><div><h3>{current.title}</h3>{mode!=="workplace"&&<p>{current.description}</p>}</div><span className={styles.documentType}>MM · {current.type}</span></div>

        <div className={styles.contextStrip}>
          <div className={styles.contextItem}><span>Company code</span><strong>1000 · Training Enterprise</strong></div>
          <div className={styles.contextItem}><span>Process</span><strong>Procure-to-Pay</strong></div>
          <div className={styles.contextItem}><span>Source document</span><strong>{sourceDoc?.document_number??"Not selected"}</strong></div>
          <div className={styles.contextItem}><span>Document status</span><strong>{posting?"Processing":"Draft"}</strong></div>
        </div>

        <section className={styles.section}>
          <div className={styles.sectionHeader}><strong>{active==="create_pr"?"Requirement data":active==="create_po"?"Purchasing header":active==="post_gr"?"Receipt header":"Invoice header"}</strong><span>* Required fields</span></div>
          <div className={styles.fields}>
            {active==="create_pr"&&<>{select("Material","material",master("material").map(x=>({value:x.code,text:`${x.code} · ${x.name}`})),"Material master item to be requested")}{select("Plant","plant",master("plant").map(x=>({value:x.code,text:`${x.code} · ${x.name}`})),"Business location that requires the material")}{input("Requested quantity","quantity","number","Quantity requested by the business")}</>}
            {active==="create_po"&&<>{select("Source purchase requisition","source_pr",availablePrs.map(x=>({value:x.document_number,text:`${x.document_number} · ${x.status}`})),"Open internal requirement")}{select("Vendor","vendor",master("vendor").map(x=>({value:x.code,text:`${x.code} · ${x.name}`})),"Approved supplier")}{select("Purchasing organization","purchasing_organization",master("purchasing_organization").map(x=>({value:x.code,text:`${x.code} · ${x.name}`})),"Buying organization responsible for the PO")}{input("Unit price","unit_price","number","Agreed supplier price per unit")}</>}
            {active==="post_gr"&&<>{select("Source purchase order","source_po",availablePos.map(x=>({value:x.document_number,text:`${x.document_number} · ${x.status}`})),"Open PO being received")}{select("Storage location","storage_location",master("storage_location").map(x=>({value:x.code,text:`${x.code} · ${x.name}`})),"Stock location where material will be stored")}{input("Received quantity","received_quantity","number","Physical quantity received today")}</>}
            {active==="post_invoice"&&<>{select("Source purchase order","source_po",availablePos.map(x=>({value:x.document_number,text:`${x.document_number} · ${x.status}`})),"Open PO referenced by the supplier invoice")}{input("Supplier invoice value","invoice_value","number","Total amount claimed by the supplier")}</>}
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}><strong>Item overview</strong><span>Line 10 · Material item</span></div>
          <div className={styles.itemTableWrap}><table className={styles.itemTable}><thead><tr><th>Item</th><th>Material</th><th>Quantity</th><th>Plant / Location</th><th>Source</th><th>Status</th></tr></thead><tbody><tr><td>10</td><td>{itemMaterial}</td><td>{itemQty}</td><td>{values.plant||values.storage_location||String(sourceDoc?.header.plant??"—")}</td><td>{sourceDoc?.document_number??"—"}</td><td className={styles.mutedCell}>{ready?"Ready":"Incomplete"}</td></tr></tbody></table></div>
        </section>

        {message&&<div className={`${styles.statusCallout} ${lastSuccess?styles.success:styles.warning}`}><span className={styles.statusIcon}>{lastSuccess?"✓":"!"}</span><span>{message}</span></div>}
        {!message&&mode==="guided"&&<div className={`${styles.statusCallout} ${styles.ready}`}><span className={styles.statusIcon}>i</span><span>Enter the business values above. The document can be posted only when all required fields are complete.</span></div>}
      </div>
    </ErpTrainingShell>

    <section className="dashboardLowerGrid">
      <article className="nextStepCard"><span className="eyebrow">Live document chain</span><h2>Your posted business documents</h2><div className={styles.chain}>{[...prs,...pos,...grs,...ivs].map(d=><Link className={styles.chainNode} href={`/documents/${encodeURIComponent(d.document_number)}`} key={d.document_number}><strong>{d.document_number}</strong><span>{d.document_type} · {d.status}</span></Link>)}{!prs.length&&!pos.length&&!grs.length&&!ivs.length&&<p className={styles.empty}>No documents yet. Create the purchase requisition to begin the process.</p>}</div></article>
      <article className="workGateCard unlocked"><span className="eyebrow">Process monitor</span><h2>{ivs.some(x=>x.status==="posted")?"Procure-to-pay cycle completed":"Continue the document chain"}</h2><div className={styles.summaryRow}><div className={styles.summaryCard}><strong>{prs.length}</strong><span>PR</span></div><div className={styles.summaryCard}><strong>{pos.length}</strong><span>PO</span></div><div className={styles.summaryCard}><strong>{grs.length}</strong><span>GR</span></div><div className={styles.summaryCard}><strong>{ivs.length}</strong><span>Invoices</span></div></div></article>
    </section>
  </main>;
}
