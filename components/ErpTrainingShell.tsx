"use client";

import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { authenticatedFetch } from "../lib/auth-client";
import LearnerGuide from "./LearnerGuide";
import styles from "./ErpTrainingShell.module.css";

export type SimulationMode = "guided" | "assisted" | "workplace";

type Props = {
  title: string;
  transactionLabel: string;
  modeLabel?: string;
  simulationMode?: SimulationMode;
  status?: "ready" | "checking" | "success" | "warning";
  children: ReactNode;
  actions?: ReactNode;
  learningGoal?: string;
  currentTask?: string;
  nextStep?: string;
};

type RuntimeData={transactions:{code:string;name:string;area:string}[];documents:{document_number:string;document_type:string;status:string;created_at:string}[]};
type Metrics={mistakes:number;corrections:number;helpRequests:number;modeSwitches:number};
const navItems = [
  {label:"Home",icon:"⌂"},
  {label:"Procurement",icon:"▤"},
  {label:"Inventory",icon:"▦"},
  {label:"Invoices",icon:"▧"},
  {label:"Reports",icon:"◫"},
];
const modeNames:Record<SimulationMode,string>={guided:"Guided Simulation",assisted:"Assisted Simulation",workplace:"Workplace Simulation"};
function score(mode:SimulationMode,m:Metrics){const base=mode==="workplace"?100:mode==="assisted"?92:82;const recovery=Math.min(m.corrections,m.mistakes)*2;return Math.max(0,Math.min(100,base-m.mistakes*8-m.helpRequests*5-m.modeSwitches*3+recovery));}
function newSessionId(){return `${Date.now()}-${Math.random().toString(36).slice(2,10)}`;}

export default function ErpTrainingShell({ title, transactionLabel, modeLabel = "Training client", simulationMode="guided", status = "ready", children, actions, learningGoal, currentTask, nextStep }: Props) {
  const [activeTab, setActiveTab] = useState("Document");
  const [activeNav, setActiveNav] = useState("Procurement");
  const [search, setSearch] = useState("");
  const [runtime,setRuntime]=useState<RuntimeData|null>(null);
  const [helpOpen,setHelpOpen]=useState(false);
  const [metrics,setMetrics]=useState<Metrics>({mistakes:0,corrections:0,helpRequests:0,modeSwitches:0});
  const [sessionResult,setSessionResult]=useState<{score:number;documentNumber:string}|null>(null);
  const [savingSession,setSavingSession]=useState(false);
  const startedAt=useRef(Date.now());
  const sessionId=useRef(newSessionId());
  const previousStatus=useRef(status);
  const previousMode=useRef(simulationMode);

  useEffect(()=>{
    const timer=setTimeout(()=>{
      void authenticatedFetch(`/api/erp-runtime?q=${encodeURIComponent(search)}`).then(async r=>{
        const data=await r.json() as RuntimeData;
        setRuntime(data);
      });
    },search?180:0);
    return()=>clearTimeout(timer);
  },[search]);

  useEffect(()=>{
    if(previousMode.current!==simulationMode){
      setMetrics(m=>({...m,modeSwitches:m.modeSwitches+1}));
      setHelpOpen(false);
      setSessionResult(null);
      previousMode.current=simulationMode;
    }
  },[simulationMode]);

  useEffect(()=>{
    const previous=previousStatus.current;
    if(status==="warning"&&previous!=="warning")setMetrics(m=>({...m,mistakes:m.mistakes+1}));
    if(previous==="warning"&&(status==="ready"||status==="checking"))setMetrics(m=>({...m,corrections:m.corrections+1}));
    previousStatus.current=status;
  },[status]);

  const message = useMemo(() => {
    if (status === "checking") return "Validating business data and document consistency…";
    if (status === "success") return simulationMode==="workplace"?"Transaction posted.":"Document check completed successfully.";
    if (status === "warning") return simulationMode==="guided"?"Review the highlighted business values before continuing.":"Transaction requires attention.";
    if(simulationMode==="guided") return "System ready. Enter the required business data and continue when complete.";
    if(simulationMode==="assisted") return helpOpen?"Assistance opened. Use it only where needed, then continue independently.":"System ready. Assistance is available on request.";
    return "System ready.";
  }, [status,simulationMode,helpOpen]);

  const statusLabel=status==="checking"?"Processing":status==="success"?"Verified":status==="warning"?"Attention":"Ready";
  const liveScore=score(simulationMode,metrics);
  const showGuide=simulationMode==="guided"||(simulationMode==="assisted"&&helpOpen);

  function requestHelp(){if(simulationMode!=="assisted")return;setHelpOpen(v=>{if(!v)setMetrics(m=>({...m,helpRequests:m.helpRequests+1}));return !v;});setSessionResult(null);}
  async function finishSession(){if(savingSession)return;setSavingSession(true);try{const elapsed=Date.now()-startedAt.current;const response=await authenticatedFetch("/api/training-session",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({session_id:sessionId.current,transaction:transactionLabel,title,mode:simulationMode,elapsed_ms:elapsed,mistakes:metrics.mistakes,corrections:metrics.corrections,help_requests:metrics.helpRequests,mode_switches:metrics.modeSwitches,completed:true})});if(!response)return;const payload=await response.json();if(response.ok)setSessionResult({score:Number(payload.independenceScore??liveScore),documentNumber:String(payload.documentNumber??"")});}finally{setSavingSession(false);}}

  return (
    <section className={styles.shell} aria-label="ERP training workspace" data-simulation-mode={simulationMode} data-independence-score={liveScore}>
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
          <div className={styles.mode}><strong>{modeLabel}</strong><span>{modeNames[simulationMode]}</span></div>
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
            <div className={styles.metaItem}><span>Mode</span><strong>{modeNames[simulationMode]}</strong></div>
            <div className={styles.metaItem} data-training-metrics><span>Independence</span><strong>{liveScore}/100</strong></div>
          </div>
        </div>

        <div className={styles.tabs} role="tablist" aria-label="Document workspace sections">
          {["Document", "Items", "Details", "History"].map(tab=><button key={tab} type="button" role="tab" aria-selected={activeTab===tab} className={activeTab===tab?styles.active:""} onClick={()=>setActiveTab(tab)}>{tab}</button>)}
        </div>

        <div className={styles.workspace}><div className={styles.canvas}>
          {simulationMode==="assisted"&&<div style={{display:"flex",justifyContent:"flex-end",marginBottom:8}}><button type="button" onClick={requestHelp} aria-expanded={helpOpen}>{helpOpen?"Hide assistance":"Need a hint"}</button></div>}
          {showGuide&&<LearnerGuide
            compact
            learning={learningGoal ?? `How ${transactionLabel} works in a business process`}
            now={currentTask ?? title}
            next={simulationMode==="guided"?(nextStep ?? "Check the result, then continue to the next business step"):"Complete the transaction using the available business context"}
          />}
          {children}
        </div></div>
        {actions&&<div className={styles.actions}>{actions}</div>}
        <div className={styles.status} data-status={status} role="status" aria-live="polite"><span className={styles.dot}/><span>{message}</span><div className={styles.statusRight}><span>{statusLabel}</span><span>{modeNames[simulationMode]}</span><span data-mistakes>Mistakes {metrics.mistakes}</span><span data-corrections>Corrections {metrics.corrections}</span><span data-help-requests>Hints {metrics.helpRequests}</span><button type="button" onClick={finishSession} disabled={savingSession}>{savingSession?"Saving…":"Finish session"}</button></div></div>
        {sessionResult&&<div role="status" data-session-result style={{padding:"10px 14px",fontSize:12,borderTop:"1px solid #e5e7eb"}}>Session saved · Independence score <strong>{sessionResult.score}/100</strong> · {sessionResult.documentNumber}</div>}
      </div>
    </section>
  );
}
