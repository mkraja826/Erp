"use client";

import { ReactNode, useMemo, useState } from "react";

type Props = {
  title: string;
  transactionLabel: string;
  modeLabel?: string;
  status?: "ready" | "checking" | "success" | "warning";
  children: ReactNode;
  actions?: ReactNode;
};

const navItems = ["Home", "Procurement", "Inventory", "Invoices", "Reports"];

export default function ErpTrainingShell({ title, transactionLabel, modeLabel = "Training client", status = "ready", children, actions }: Props) {
  const [activeTab, setActiveTab] = useState("Document");
  const [search, setSearch] = useState("");
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
      </aside>
      <div className="erpClientMain">
        <div className="erpClientTopbar">
          <div><strong>{modeLabel}</strong><span>Educational simulation</span></div>
          <div className="erpTransactionSearch"><span>⌕</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search transaction or task" /></div>
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
