"use client";

import Link from "next/link";
import { useEffect,useState } from "react";
import { getStoredSession } from "../../../lib/auth-client";

type Doc={document_number:string;document_type:string;status:string;header:Record<string,unknown>;items:Array<Record<string,unknown>>;created_at:string};
type FlowDoc=Doc&{relation:string;metrics:Record<string,unknown>;inventoryImpact:null|Record<string,unknown>};
type Data={document:Doc;linkedDocuments:Doc[];documentFlow:FlowDoc[]};

function value(v:unknown){if(v===null||v===undefined||v==="")return "—";if(typeof v==="object")return JSON.stringify(v);return String(v);}
function label(k:string){return k.replaceAll("_"," ").replace(/\b\w/g,m=>m.toUpperCase());}
function summary(d:FlowDoc){
  if(d.document_type==="PR")return `${value(d.metrics.material)} · qty ${value(d.metrics.quantity)} · plant ${value(d.metrics.plant)}`;
  if(d.document_type==="PO")return `${value(d.metrics.vendor)} · qty ${value(d.metrics.quantity)} · value ${value(d.metrics.value)}`;
  if(d.document_type==="GR")return `101 · received ${value(d.metrics.quantity)} · open ${value(d.metrics.openQuantity)} · ${value(d.metrics.storageLocation)}`;
  if(d.document_type==="IV")return `${value(d.metrics.supplierInvoiceNumber)} · value ${value(d.metrics.invoiceValue)} · variance ${value(d.metrics.variance)} · ${value(d.metrics.matchStatus)}`;
  return d.document_type;
}

export default function DocumentPage({params}:{params:Promise<{number:string}>}){
  const [data,setData]=useState<Data|null>(null);const [error,setError]=useState("");
  useEffect(()=>{void load();},[]);
  async function load(){const session=getStoredSession();if(!session){window.location.href="/auth";return;}const p=await params;const r=await fetch(`/api/documents/${encodeURIComponent(p.number)}`,{headers:{Authorization:`Bearer ${session.access_token}`}});const j=await r.json();if(!r.ok){setError(j.error??"Unable to load document.");return;}setData(j as Data);}
  if(error)return <main className="dashboardPage"><p>{error}</p></main>;if(!data)return <main className="dashboardPage"><p>Loading document…</p></main>;
  const d=data.document;
  const impacts=data.documentFlow.filter(x=>x.inventoryImpact);
  return <main className="dashboardPage"><header className="dashboardTopbar"><Link className="brandLink" href="/procurement-flow">ERP Edu · Document Display</Link><Link className="secondaryButton" href="/procurement-flow">Back to flow</Link></header>
    <section className="dashboardHero"><div><span className="eyebrow">Document drill-down</span><h1>{d.document_number}</h1><p>{d.document_type} · {d.status} · Posted {new Date(d.created_at).toLocaleString()}</p></div></section>
    <section className="dashboardGrid"><article className="dashboardCourseCard"><span className="courseBadge">Header</span><h2>Document header</h2><div className="docKeyGrid">{Object.entries(d.header).map(([k,v])=><div key={k}><span>{label(k)}</span><strong>{value(v)}</strong></div>)}</div></article><article className="dashboardCourseCard"><span className="courseBadge">Items</span><h2>Line items</h2>{d.items.length?d.items.map((item,i)=><div className="docItemCard" key={i}><strong>Item {i+1}</strong><div className="docKeyGrid">{Object.entries(item).map(([k,v])=><div key={k}><span>{label(k)}</span><strong>{value(v)}</strong></div>)}</div></div>):<p>No line items on this document.</p>}</article></section>

    <section className="nextStepCard" style={{marginTop:22}}><span className="eyebrow">Workplace traceability</span><h2>End-to-end document flow</h2><p>Trace the business requirement through supplier commitment, physical receipt, inventory impact and invoice verification.</p><div className="flowDocumentList">{data.documentFlow.map((x,index)=><Link href={`/documents/${encodeURIComponent(x.document_number)}`} key={x.document_number} aria-current={x.document_number===d.document_number?"page":undefined}><strong>{index+1}. {x.document_number}</strong><span>{x.relation} · {x.document_type} · {x.status}</span><small>{summary(x)}</small></Link>)}</div></section>

    {impacts.length>0&&<section className="nextStepCard" style={{marginTop:22}}><span className="eyebrow">Inventory consequence</span><h2>Goods-receipt stock impact</h2><div className="docKeyGrid">{impacts.map(x=>{const i=x.inventoryImpact!;return <div key={x.document_number}><span>{x.document_number} · {value(i.material)} · {value(i.plant)}/{value(i.storageLocation)}</span><strong>+{value(i.postedQuantity)} posted · current stock {value(i.currentStock)}</strong></div>})}</div></section>}
  </main>;
}
