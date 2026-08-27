"use client";

import { ReactNode, useEffect, useMemo, useState } from "react";
import { getStoredSession } from "../lib/auth-client";

type Props = {
  title: string;
  transactionLabel: string;
  modeLabel?: string;
  status?: "ready" | "checking" | "success" | "warning";
  children: ReactNode;
  actions?: ReactNode;
};

type RuntimeData={transactions:{code:string;name:string;area:string}[];documents:{document_number:string;document_type:string;status:string;created_at:string}[]};
const navItems = ["Home", "Procurement", "Inventory", "Invoices", "Reports"];

export default function ErpTrainingShell({ title, transactionLabel, modeLabel = "Training client", status = "ready", children, actions }: Props) {
  const [activeTab, setActiveTab] = useState("Document");
  const [search, setSearch] = useState("");
  const [runtime,setRuntime]=useState<RuntimeData|null>(null);
  useEffect(()=>{const session=getStoredSession();if(!session)return;fetch(`/api/erp-runtime?q=${encodeURIComponent(search)}`,{headers:{Authorization:`Bearer ${session.access_token}`}}).then(r=>r.ok?r.json():null).then(data=>{if(data)setRuntime(data as RuntimeData)});},[search]);
  const message = useMemo(() => {
    if (status === "checking") return "Checking document against the training scenario…";
    if (status === "success") return "Document verified successfully.";
    if (status === "warning") return "Review highlighted business values and try again.";
    return "Ready for input. Complete the business document, then verify it.";
  }, [status]);

  return (
    <div className="erpClientShell">
      <aside className="erpSidebar">
        <div className="erpLogo">ERP</div>
        <nav>{navItems.map((item, index) => <button key={item} className={index === 1 ? "active" : ""} type="button">{item}</button>)}</nav>
        {runtime?.documents?.length ? <div className="erpRecentDocs"><span>Recent documents</span>{runtime.documents.slice(0,4).map(doc=><small key={doc.document_number}>{doc.document_number}</small>)}</div>:null}
      </aside>
      <div className="erpClientMain">
        <div className="erpClientTopbar">
          <div><strong>{modeLabel}</strong><span>Educational simulation</span></div>
          <div className="erpSearchWrap"><div className="erpTransactionSearch"><span>⌕</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search transaction or task" /></div>{search&&runtime&&<div className="erpSearchResults">{runtime.transactions.length?runtime.transactions.map(t=><button type="button" key={t.code}><strong>{t.code}</strong><span>{t.name}</span><small>{t.area}</small></button>):<span>No matching transaction</span>}</div>}</div>
        </div>
        <div className="erpDocumentHeader">
          <div><span className="erpBreadcrumb">Materials Management / {transactionLabel}</span><h4>{title}</h4></div>
          <span className="erpDocState">Draft</span>
        </div>
        <div className="erpTabs">
          {["Document", "Items", "Details"].map(tab => <button key={tab} type="button" className={activeTab === tab ? "active" : ""} onClick={() => setActiveTab(tab)}>{tab}</button>)}
        </div>
        <div className="erpDocumentBody">{children}</div>
        {actions && <div className="erpClientActions">{actions}</div>}
        <div className={`erpStatusBar ${status}`}><span className="erpStatusDot" />{message}</div>
      </div>
    </div>
  );
}
