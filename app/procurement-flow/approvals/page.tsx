"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

type ApprovalDoc={documentNumber:string;documentType:string;operationalStatus:string;releaseStatus:string;requiredRole:string;createdAt:string;itemCount:number};

export default function ApprovalInbox(){
  const [docs,setDocs]=useState<ApprovalDoc[]>([]);const [error,setError]=useState("");const [busy,setBusy]=useState("");
  function token(){try{return JSON.parse(localStorage.getItem("erp-edu-session")||"{}").access_token as string|undefined}catch{return undefined}}
  async function load(){const t=token();if(!t)return;const r=await fetch("/api/procurement-flow/approvals",{headers:{Authorization:`Bearer ${t}`}});const b=await r.json();if(r.ok)setDocs(b.documents??[]);else setError(b.error??"Unable to load approvals.");}
  useEffect(()=>{void load()},[]);
  async function act(doc:ApprovalDoc,action:"submit"|"approve"|"reject"){
    const t=token();if(!t)return;setBusy(doc.documentNumber+action);setError("");
    const role=action==="submit"?(doc.documentType==="PR"?"requester":"buyer"):doc.requiredRole;
    const comment=action==="reject"?"Rejected during workplace approval exercise":"";
    const r=await fetch("/api/procurement-flow/approvals",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${t}`},body:JSON.stringify({action,data:{document_number:doc.documentNumber,acting_role:role,comment}})});const b=await r.json();if(!r.ok)setError(b.error??"Approval action failed.");await load();setBusy("");
  }
  return <main style={{minHeight:"100vh",background:"#f5f7fb",padding:"24px 16px 48px",color:"#172033"}}>
    <div style={{maxWidth:1100,margin:"0 auto"}}>
      <header style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:16,marginBottom:20}}><div><div style={{fontSize:12,fontWeight:800,letterSpacing:1,color:"#667085"}}>PHASE 4B · RELEASE STRATEGY</div><h1 style={{margin:"6px 0"}}>Procurement approval inbox</h1><p style={{margin:0,color:"#667085"}}>Submit PRs and POs for approval, then release or reject them under the required workplace role.</p></div><Link href="/procurement-flow">Back to simulator</Link></header>
      {error&&<div role="alert" style={{background:"#fef3f2",border:"1px solid #fecdca",padding:12,borderRadius:10,marginBottom:14}}>{error}</div>}
      <div style={{overflowX:"auto",background:"white",border:"1px solid #e4e7ec",borderRadius:14}}><table style={{width:"100%",minWidth:820,borderCollapse:"collapse"}}><thead><tr style={{background:"#f9fafb"}}>{["Document","Type","Operational","Release","Required role","Items","Actions"].map(h=><th key={h} style={{textAlign:"left",padding:12,borderBottom:"1px solid #eaecf0",fontSize:12}}>{h}</th>)}</tr></thead><tbody>{docs.map(doc=><tr key={doc.documentNumber}><td style={{padding:12,borderBottom:"1px solid #eaecf0",fontWeight:700}}>{doc.documentNumber}</td><td style={{padding:12,borderBottom:"1px solid #eaecf0"}}>{doc.documentType}</td><td style={{padding:12,borderBottom:"1px solid #eaecf0"}}>{doc.operationalStatus}</td><td style={{padding:12,borderBottom:"1px solid #eaecf0"}}>{doc.releaseStatus}</td><td style={{padding:12,borderBottom:"1px solid #eaecf0"}}>{doc.requiredRole}</td><td style={{padding:12,borderBottom:"1px solid #eaecf0"}}>{doc.itemCount}</td><td style={{padding:12,borderBottom:"1px solid #eaecf0",display:"flex",gap:8,flexWrap:"wrap"}}>{["draft","rejected"].includes(doc.releaseStatus)&&<button style={{minHeight:44}} disabled={!!busy} onClick={()=>act(doc,"submit")}>Submit</button>}{doc.releaseStatus==="pending_approval"&&<><button style={{minHeight:44}} disabled={!!busy} onClick={()=>act(doc,"approve")}>Release</button><button style={{minHeight:44}} disabled={!!busy} onClick={()=>act(doc,"reject")}>Reject</button></>}{doc.releaseStatus==="released"&&<strong>Released</strong>}</td></tr>)}</tbody></table></div>
      {docs.length===0&&<p style={{color:"#667085",marginTop:18}}>No PR or PO documents are available yet. Create procurement documents first, then return here.</p>}
    </div>
  </main>
}
