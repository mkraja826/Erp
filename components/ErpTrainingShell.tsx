"use client";

import { ReactNode, useEffect, useMemo, useState } from "react";
import { authenticatedFetch } from "../lib/auth-client";
import LearnerGuide from "./LearnerGuide";
import styles from "./ErpTrainingShell.module.css";

type Props = {
  title: string;
  transactionLabel: string;
  modeLabel?: string;
  status?: "ready" | "checking" | "success" | "warning";
  children: ReactNode;
  actions?: ReactNode;
  learningGoal?: string;
  currentTask?: string;
  nextStep?: string;
};

type RuntimeData={transactions:{code:string;name:string;area:string}[];documents:{document_number:string;document_type:string;status:string;created_at:string}[]};
const navItems = [
  {label:"Home",icon:"⌂"},
  {label:"Procurement",icon:"▤"},
  {label:"Inventory",icon:"▦"},
  {label:"Invoices",icon:"▧"},
  {label:"Reports",icon:"◫"},
];

export default function ErpTrainingShell({ title, transactionLabel, modeLabel = "Training client", status = "ready", children, actions, learningGoal, currentTask, nextStep }: Props) {
  const [activeTab, setActiveTab] = useState("Document");
  const [activeNav, setActiveNav] = useState("Procurement");
  const [search, setSearch] = useState("");
  const [runtime,setRuntime]=useState<RuntimeData|null>(null);

  useEffect(()=>{
    const timer=setTimeout(()=>{
      void authenticatedFetch(`/api/erp-runtime?q=${encodeURIComponent(search)}`).then(async r=>{
        const data=await r.json() as RuntimeData;
        setRuntime(data);
      });
    },search?180:0);
    return()=>clearTimeout(timer);
  },[search]);

  const message = useMemo(() => {
    if (status === "checking") return "Validating business data and document consistency…";
    if (status === "success") return "Document check completed successfully.";
    if (status === "warning") return "Review the highlighted business values before continuing.";
    return "System ready. Enter the required business data and continue when complete.";
  }, [status]);

  const statusLabel=status==="checking"?"Processing":status==="success"?"Verified":status==="warning"?"Attention":"Ready";

  return (
    <section className={styles.shell} aria-label="ERP training workspace">
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <div className={styles.logo}>ERP</div>
          <div className={styles.brandText}><strong>ERP Workspace</strong><span>Materials Management</span></div>
        </div>
        <nav className={styles.nav} aria-label="ERP modules">
          {navItems.map((item)=><button key={item.label} className={activeNav===item.label?styles.active:""} type="button" onClick={()=>setActiveNav(item.label)} aria-current={activeNav===item.label?"page":undefined}><span className={styles.navIcon}>{item.icon}</span><span>{item.label}</span></button>)}
        </nav>
        {runtime?.documents?.length ? <div className={styles.sidebarSection}><span className={styles.sidebarLabel}>Recent documents</span>{runtime.documents.slice(0,4).map(doc=><div className={styles.recentDoc} key={doc.document_number}><strong>{doc.document_number}</strong><span>{doc.document_type} · {doc.status}</span></div>)}</div>:null}
      </aside>

      <div className={styles.main}>
        <div className={styles.utilityBar}>
          <div className={styles.utilityGroup}><span className={styles.clientCode}>Client 100</span><span>Company: Training Enterprise</span><span>Module: MM</span></div>
          <div className={styles.utilityGroup}><span className={styles.envBadge}><span className={styles.envDot}/>Training environment</span><span>EN</span></div>
        </div>

        <div className={styles.topbar}>
          <div className={styles.mode}><strong>{modeLabel}</strong><span>Enterprise process simulation</span></div>
          <div className={styles.searchWrap}>
            <div className={styles.search}><span className={styles.searchIcon}>⌕</span><input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Search transaction, document or task" aria-label="Search ERP workspace" /></div>
            {search&&runtime&&<div className={styles.searchResults}>{runtime.transactions.length?runtime.transactions.map(t=><button type="button" key={t.code} onClick={()=>setSearch(t.code)}><strong>{t.code}</strong><span>{t.name}</span><small>{t.area}</small></button>):<span className={styles.emptySearch}>No matching transaction</span>}</div>}
          </div>
        </div>

        <div className={styles.contextBar}>
          <div>
            <div className={styles.breadcrumb}>Materials Management / {activeNav} / {transactionLabel}</div>
            <div className={styles.titleRow}><h4>{title}</h4><span className={styles.state}>{statusLabel}</span></div>
          </div>
          <div className={styles.contextMeta}>
            <div className={styles.metaItem}><span>Document</span><strong>New</strong></div>
            <div className={styles.metaItem}><span>User role</span><strong>Junior MM User</strong></div>
            <div className={styles.metaItem}><span>Mode</span><strong>Guided Simulation</strong></div>
          </div>
        </div>

        <div className={styles.tabs} role="tablist" aria-label="Document workspace sections">
          {["Document", "Items", "Details", "History"].map(tab=><button key={tab} type="button" role="tab" aria-selected={activeTab===tab} className={activeTab===tab?styles.active:""} onClick={()=>setActiveTab(tab)}>{tab}</button>)}
        </div>

        <div className={styles.workspace}><div className={styles.canvas}>
          <LearnerGuide
            compact
            learning={learningGoal ?? `How ${transactionLabel} works in a business process`}
            now={currentTask ?? title}
            next={nextStep ?? "Check the result, then continue to the next business step"}
          />
          {children}
        </div></div>
        {actions&&<div className={styles.actions}>{actions}</div>}
        <div className={styles.status} data-status={status} role="status" aria-live="polite"><span className={styles.dot}/><span>{message}</span><div className={styles.statusRight}><span>{statusLabel}</span><span>MM Workspace</span></div></div>
      </div>
    </section>
  );
}
