"use client";

import Link from "next/link";
import { useEffect,useState } from "react";
import { getStoredSession } from "../../../lib/auth-client";

type Doc={document_number:string;document_type:string;status:string;header:Record<string,unknown>;items:Array<Record<string,unknown>>;created_at:string};
type Data={document:Doc;linkedDocuments:Doc[]};

function value(v:unknown){if(v===null||v===undefined||v==="")return "—";if(typeof v==="object")return JSON.stringify(v);return String(v);}
function label(k:string){return k.replaceAll("_"," ").replace(/\b\w/g,m=>m.toUpperCase());}

export default function DocumentPage({params}:{params:Promise<{number:string}>}){
  const [data,setData]=useState<Data|null>(null);const [error,setError]=useState("");
  useEffect(()=>{void load();},[]);
  async function load(){const session=getStoredSession();if(!session){window.location.href="/auth";return;}const p=await params;const r=await fetch(`/api/documents/${encodeURIComponent(p.number)}`,{headers:{Authorization:`Bearer ${session.access_token}`}});const j=await r.json();if(!r.ok){setError(j.error??"Unable to load document.");return;}setData(j as Data);}
  if(error)return <main className="dashboardPage"><p>{error}</p></main>;if(!data)return <main className="dashboardPage"><p>Loading document…</p></main>;
  const d=data.document;
  return <main className="dashboardPage"><header className="dashboardTopbar"><Link className="brandLink" href="/procurement-flow">ERP Edu · Document Display</Link><Link className="secondaryButton" href="/procurement-flow">Back to flow</Link></header>
    <section className="dashboardHero"><div><span className="eyebrow">Document drill-down</span><h1>{d.document_number}</h1><p>{d.document_type} · {d.status} · Posted {new Date(d.created_at).toLocaleString()}</p></div></section>
    <section className="dashboardGrid"><article className="dashboardCourseCard"><span className="courseBadge">Header</span><h2>Document header</h2><div className="docKeyGrid">{Object.entries(d.header).map(([k,v])=><div key={k}><span>{label(k)}</span><strong>{value(v)}</strong></div>)}</div></article><article className="dashboardCourseCard"><span className="courseBadge">Items</span><h2>Line items</h2>{d.items.length?d.items.map((item,i)=><div className="docItemCard" key={i}><strong>Item {i+1}</strong><div className="docKeyGrid">{Object.entries(item).map(([k,v])=><div key={k}><span>{label(k)}</span><strong>{value(v)}</strong></div>)}</div></div>):<p>No line items on this document.</p>}</article></section>
    <section className="nextStepCard" style={{marginTop:22}}><span className="eyebrow">Document flow</span><h2>Linked documents</h2><div className="flowDocumentList">{data.linkedDocuments.map(x=><Link href={`/documents/${encodeURIComponent(x.document_number)}`} key={x.document_number}><strong>{x.document_number}</strong><span>{x.document_type} · {x.status}</span></Link>)}{!data.linkedDocuments.length&&<p>No predecessor or successor documents yet.</p>}</div></section>
  </main>;
}
