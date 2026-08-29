"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { authenticatedFetch } from "../../../lib/auth-client";
import styles from "./MultiLineProcurement.module.css";

type Master={entity_type:string;code:string;name:string};
type Doc={document_number:string;document_type:string;status:string;header:Record<string,unknown>;items:Array<Record<string,unknown>>};
type Runtime={masterData:Master[];documents:Doc[]};
type Step="pr"|"po"|"gr"|"invoice";
type ReqLine={line_number:number;material:string;quantity:string};
type PriceLine={line_number:number;material:string;quantity:number;unit_price:string};
type ReceiptLine={line_number:number;material:string;ordered:number;open:number;received_quantity:string;storage_location:string};

const initialReq=():ReqLine=>({line_number:10,material:"",quantity:""});
const today=()=>new Date().toISOString().slice(0,10);

export default function MultiLineProcurementPage(){
  const [runtime,setRuntime]=useState<Runtime|null>(null);
  const [step,setStep]=useState<Step>("pr");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [prLines,setPrLines]=useState<ReqLine[]>([initialReq(),{line_number:20,material:"",quantity:""}]);
  const [plant,setPlant]=useState("");
  const [sourcePr,setSourcePr]=useState("");const [vendor,setVendor]=useState("");const [porg,setPorg]=useState("");const [prices,setPrices]=useState<PriceLine[]>([]);
  const [sourcePo,setSourcePo]=useState("");const [receiptLines,setReceiptLines]=useState<ReceiptLine[]>([]);const [postingDate,setPostingDate]=useState(today());const [documentDate,setDocumentDate]=useState(today());
  const [invoiceNumber,setInvoiceNumber]=useState("");const [invoiceDate,setInvoiceDate]=useState(today());const [invoicePostingDate,setInvoicePostingDate]=useState(today());const [invoiceValue,setInvoiceValue]=useState("");

  async function load(){const r=await authenticatedFetch("/api/erp-runtime");if(r?.ok)setRuntime(await r.json());}
  useEffect(()=>{void load();},[]);
  const master=(type:string)=>runtime?.masterData.filter(x=>x.entity_type===type)??[];
  const docs=runtime?.documents??[];const prs=docs.filter(d=>d.document_type==="PR"&&d.status==="open"&&d.header?.multi_line===true);const pos=docs.filter(d=>d.document_type==="PO"&&d.status!=="closed"&&d.header?.multi_line===true);
  const selectedPr=prs.find(d=>d.document_number===sourcePr);const selectedPo=pos.find(d=>d.document_number===sourcePo);

  useEffect(()=>{if(!selectedPr){setPrices([]);return;}setPrices(selectedPr.items.map((item,i)=>({line_number:Number(item.line_number??(i+1)*10),material:String(item.material??""),quantity:Number(item.quantity??0),unit_price:""})));},[sourcePr]);
  useEffect(()=>{if(!selectedPo){setReceiptLines([]);return;}setReceiptLines(selectedPo.items.map((item,i)=>({line_number:Number(item.line_number??(i+1)*10),material:String(item.material??""),ordered:Number(item.quantity??0),open:Number(item.quantity??0),received_quantity:String(item.quantity??""),storage_location:"SL01"})));},[sourcePo]);

  const poValue=useMemo(()=>selectedPo?.items.reduce((sum,item)=>sum+Number(item.quantity??0)*Number(item.unit_price??0),0)??0,[selectedPo]);
  const receiptValue=useMemo(()=>selectedPo?receiptLines.reduce((sum,line)=>{const poLine=selectedPo.items.find(item=>Number(item.line_number)===line.line_number);return sum+Number(line.received_quantity||0)*Number(poLine?.unit_price??0);},0):0,[selectedPo,receiptLines]);
  const variance=Number(invoiceValue||0)-receiptValue;

  function updateReq(index:number,key:"material"|"quantity",value:string){setPrLines(lines=>lines.map((line,i)=>i===index?{...line,[key]:value}:line));}
  function addReq(){setPrLines(lines=>[...lines,{line_number:(lines.at(-1)?.line_number??0)+10,material:"",quantity:""}]);}
  function removeReq(index:number){setPrLines(lines=>lines.length<=2?lines:lines.filter((_,i)=>i!==index).map((line,i)=>({...line,line_number:(i+1)*10})));}

  async function action(action:string,data:Record<string,unknown>){setBusy(true);setMessage("");try{const r=await authenticatedFetch("/api/procurement-flow/multiline",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,data})});if(!r)return null;const p=await r.json();if(!r.ok){setMessage(`Error · ${p.error??"Unable to post document."}`);return null;}setMessage(`Success · ${p.documentNumber} · ${p.status??"posted"}${p.itemCount?` · ${p.itemCount} items`:""}${p.matchStatus?` · ${p.matchStatus}`:""}.`);await load();return p;}finally{setBusy(false);}}

  async function postPr(){const p=await action("create_pr",{plant,items:prLines.map(l=>({line_number:l.line_number,material:l.material,quantity:Number(l.quantity)}))});if(p){setSourcePr(p.documentNumber);setStep("po");}}
  async function postPo(){const unit_prices=Object.fromEntries(prices.map(l=>[String(l.line_number),Number(l.unit_price)]));const p=await action("create_po",{source_pr:sourcePr,vendor,purchasing_organization:porg,unit_prices});if(p){setSourcePo(p.documentNumber);setStep("gr");}}
  async function postGr(){const p=await action("post_gr",{source_po:sourcePo,posting_date:postingDate,document_date:documentDate,movement_type:"101",items:receiptLines.filter(l=>Number(l.received_quantity)>0).map(l=>({line_number:l.line_number,received_quantity:Number(l.received_quantity),storage_location:l.storage_location}))});if(p)setStep("invoice");}
  async function postInvoice(){await action("post_invoice",{source_po:sourcePo,supplier_invoice_number:invoiceNumber,invoice_date:invoiceDate,posting_date:invoicePostingDate,invoice_value:Number(invoiceValue)});}

  const prReady=plant&&prLines.length>=2&&prLines.every(l=>l.material&&Number(l.quantity)>0);
  const poReady=sourcePr&&vendor&&porg&&prices.length>=2&&prices.every(l=>Number(l.unit_price)>0);
  const grReady=sourcePo&&receiptLines.some(l=>Number(l.received_quantity)>0)&&postingDate&&documentDate;
  const invoiceReady=sourcePo&&invoiceNumber&&invoiceDate&&invoicePostingDate&&Number(invoiceValue)>0;

  return <main className={styles.page}>
    <header className={styles.topbar}><Link href="/procurement-flow">← Single-line simulator</Link><strong>ERP Edu · Multi-line Procure-to-Pay</strong><Link href="/dashboard">Dashboard</Link></header>
    <section className={styles.hero}><span>Phase 4 · Workplace realism</span><h1>Process a multi-item purchase cycle.</h1><p>Create multiple requisition lines, price each PO item, receive quantities by line and storage location, then verify the combined supplier invoice.</p></section>
    <nav className={styles.steps}>{(["pr","po","gr","invoice"] as Step[]).map((s,i)=><button key={s} className={step===s?styles.active:""} onClick={()=>{setStep(s);setMessage("");}}>{i+1}. {s==="pr"?"Requisition":s==="po"?"Purchase Order":s==="gr"?"Goods Receipt":"Invoice"}</button>)}</nav>

    {step==="pr"&&<section className={styles.card}><div className={styles.cardHead}><div><h2>Multi-line Purchase Requisition</h2><p>Minimum two material lines.</p></div><button onClick={addReq}>+ Add item</button></div><label className={styles.field}><span>Plant *</span><select value={plant} onChange={e=>setPlant(e.target.value)}><option value="">Select plant…</option>{master("plant").map(x=><option key={x.code} value={x.code}>{x.code} · {x.name}</option>)}</select></label><div className={styles.tableWrap}><table><thead><tr><th>Item</th><th>Material</th><th>Quantity</th><th></th></tr></thead><tbody>{prLines.map((line,i)=><tr key={line.line_number}><td>{line.line_number}</td><td><select aria-label={`Material line ${line.line_number}`} value={line.material} onChange={e=>updateReq(i,"material",e.target.value)}><option value="">Select…</option>{master("material").map(x=><option key={x.code} value={x.code}>{x.code} · {x.name}</option>)}</select></td><td><input aria-label={`Quantity line ${line.line_number}`} type="number" min="0" value={line.quantity} onChange={e=>updateReq(i,"quantity",e.target.value)}/></td><td><button disabled={prLines.length<=2} onClick={()=>removeReq(i)}>Remove</button></td></tr>)}</tbody></table></div><div className={styles.actions}><button className={styles.primary} disabled={!prReady||busy} onClick={postPr}>{busy?"Posting…":"Post requisition"}</button></div></section>}

    {step==="po"&&<section className={styles.card}><div className={styles.cardHead}><div><h2>Multi-line Purchase Order</h2><p>Convert the requisition and set a price for every line.</p></div></div><div className={styles.grid}><label className={styles.field}><span>Source PR *</span><select value={sourcePr} onChange={e=>setSourcePr(e.target.value)}><option value="">Select…</option>{prs.map(x=><option key={x.document_number}>{x.document_number}</option>)}</select></label><label className={styles.field}><span>Vendor *</span><select value={vendor} onChange={e=>setVendor(e.target.value)}><option value="">Select…</option>{master("vendor").map(x=><option key={x.code} value={x.code}>{x.code} · {x.name}</option>)}</select></label><label className={styles.field}><span>Purchasing organization *</span><select value={porg} onChange={e=>setPorg(e.target.value)}><option value="">Select…</option>{master("purchasing_organization").map(x=><option key={x.code} value={x.code}>{x.code} · {x.name}</option>)}</select></label></div><div className={styles.tableWrap}><table><thead><tr><th>Item</th><th>Material</th><th>Qty</th><th>Unit price</th><th>Value</th></tr></thead><tbody>{prices.map((line,i)=><tr key={line.line_number}><td>{line.line_number}</td><td>{line.material}</td><td>{line.quantity}</td><td><input aria-label={`Unit price line ${line.line_number}`} type="number" min="0" value={line.unit_price} onChange={e=>setPrices(rows=>rows.map((r,j)=>j===i?{...r,unit_price:e.target.value}:r))}/></td><td>{(line.quantity*Number(line.unit_price||0)).toFixed(2)}</td></tr>)}</tbody></table></div><div className={styles.actions}><button className={styles.primary} disabled={!poReady||busy} onClick={postPo}>{busy?"Posting…":"Create purchase order"}</button></div></section>}

    {step==="gr"&&<section className={styles.card}><div className={styles.cardHead}><div><h2>Multi-line Goods Receipt</h2><p>Receive one or more PO lines with movement type 101.</p></div></div><div className={styles.grid}><label className={styles.field}><span>Source PO *</span><select value={sourcePo} onChange={e=>setSourcePo(e.target.value)}><option value="">Select…</option>{pos.map(x=><option key={x.document_number}>{x.document_number}</option>)}</select></label><label className={styles.field}><span>Posting date *</span><input type="date" value={postingDate} onChange={e=>setPostingDate(e.target.value)}/></label><label className={styles.field}><span>Document date *</span><input type="date" value={documentDate} onChange={e=>setDocumentDate(e.target.value)}/></label></div><div className={styles.tableWrap}><table><thead><tr><th>Item</th><th>Material</th><th>Ordered</th><th>Receive now</th><th>Storage location</th></tr></thead><tbody>{receiptLines.map((line,i)=><tr key={line.line_number}><td>{line.line_number}</td><td>{line.material}</td><td>{line.ordered}</td><td><input aria-label={`Receive line ${line.line_number}`} type="number" min="0" max={line.open} value={line.received_quantity} onChange={e=>setReceiptLines(rows=>rows.map((r,j)=>j===i?{...r,received_quantity:e.target.value}:r))}/></td><td><select aria-label={`Storage line ${line.line_number}`} value={line.storage_location} onChange={e=>setReceiptLines(rows=>rows.map((r,j)=>j===i?{...r,storage_location:e.target.value}:r))}>{master("storage_location").map(x=><option key={x.code} value={x.code}>{x.code} · {x.name}</option>)}</select></td></tr>)}</tbody></table></div><div className={styles.actions}><button className={styles.primary} disabled={!grReady||busy} onClick={postGr}>{busy?"Posting…":"Post goods receipt"}</button></div></section>}

    {step==="invoice"&&<section className={styles.card}><div className={styles.cardHead}><div><h2>Multi-line Invoice Verification</h2><p>Verify the supplier invoice against the combined received value.</p></div></div><div className={styles.grid}><label className={styles.field}><span>Source PO *</span><select value={sourcePo} onChange={e=>setSourcePo(e.target.value)}><option value="">Select…</option>{pos.map(x=><option key={x.document_number}>{x.document_number}</option>)}</select></label><label className={styles.field}><span>Supplier invoice number *</span><input value={invoiceNumber} onChange={e=>setInvoiceNumber(e.target.value)}/></label><label className={styles.field}><span>Invoice date *</span><input type="date" value={invoiceDate} onChange={e=>setInvoiceDate(e.target.value)}/></label><label className={styles.field}><span>Posting date *</span><input type="date" value={invoicePostingDate} onChange={e=>setInvoicePostingDate(e.target.value)}/></label><label className={styles.field}><span>Invoice value *</span><input type="number" min="0" value={invoiceValue} onChange={e=>setInvoiceValue(e.target.value)}/></label></div><div className={styles.matchGrid}><div><span>PO value</span><strong>{poValue.toFixed(2)}</strong></div><div><span>Receipt value</span><strong>{receiptValue.toFixed(2)}</strong></div><div><span>Invoice value</span><strong>{Number(invoiceValue||0).toFixed(2)}</strong></div><div><span>Variance</span><strong>{variance>0?"+":""}{variance.toFixed(2)}</strong></div></div><div className={styles.actions}><button className={styles.primary} disabled={!invoiceReady||busy} onClick={postInvoice}>{busy?"Verifying…":"Verify & post invoice"}</button></div></section>}

    {message&&<div className={message.startsWith("Error")?styles.error:styles.success} role={message.startsWith("Error")?"alert":"status"}>{message}</div>}
  </main>;
}
