"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { authenticatedFetch } from "../../lib/auth-client";
import styles from "./InventoryWorkspace.module.css";

type InventoryRow={material_code:string;plant_code:string;storage_location_code:string;quantity:number|string};
type Doc={document_number:string;document_type:string;status:string;created_at:string;header:Record<string,unknown>;items:Array<Record<string,unknown>>};
type Runtime={inventory:InventoryRow[];documents:Doc[];masterData:Array<{entity_type:string;code:string;name:string}>};

export default function InventoryPage(){
  const [runtime,setRuntime]=useState<Runtime|null>(null);
  const [filter,setFilter]=useState("");
  useEffect(()=>{void authenticatedFetch('/api/erp-runtime').then(async r=>{if(r?.ok)setRuntime(await r.json());});},[]);
  const nameFor=(type:string,code:string)=>runtime?.masterData.find(x=>x.entity_type===type&&x.code===code)?.name??code;
  const stock=useMemo(()=>{const q=filter.trim().toLowerCase();return (runtime?.inventory??[]).filter(row=>!q||`${row.material_code} ${row.plant_code} ${row.storage_location_code}`.toLowerCase().includes(q));},[runtime,filter]);
  const movements=useMemo(()=>{const q=filter.trim().toLowerCase();return (runtime?.documents??[]).filter(d=>d.document_type==='GR').filter(d=>!q||`${d.document_number} ${String(d.header.source_po??'')} ${String(d.items?.[0]?.material??'')} ${String(d.header.storage_location??'')}`.toLowerCase().includes(q));},[runtime,filter]);
  const totalUnits=stock.reduce((sum,row)=>sum+Number(row.quantity??0),0);

  return <main className="dashboardPage">
    <header className="dashboardTopbar"><Link className="brandLink" href="/dashboard">ERP Edu · Inventory</Link><div className={styles.headerActions}><Link href="/procurement-flow" className="secondaryButton">Procure-to-Pay</Link><Link href="/dashboard" className="secondaryButton">Dashboard</Link></div></header>
    <section className="dashboardHero"><div><span className="eyebrow">Inventory operations</span><h1>Stock overview and movement history.</h1><p>Review the inventory balances created by posted goods receipts and trace every stock increase back to its source purchase order.</p></div></section>

    <section className={styles.toolbar}><div><span>Inventory workspace</span><strong>MM Stock Overview</strong></div><input aria-label="Filter inventory" value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Filter material, plant, location or document"/></section>

    <section className={styles.summaryGrid}>
      <article><span>Stock positions</span><strong>{stock.length}</strong></article>
      <article><span>Total units shown</span><strong>{totalUnits}</strong></article>
      <article><span>Goods movements</span><strong>{movements.length}</strong></article>
    </section>

    <section className={styles.panel}>
      <div className={styles.panelHeader}><div><span className="eyebrow">Current stock</span><h2>Material / Plant / Storage Location</h2></div><span className={styles.liveBadge}>Persisted balance</span></div>
      <div className={styles.tableWrap}><table><thead><tr><th>Material</th><th>Description</th><th>Plant</th><th>Storage location</th><th className={styles.number}>Unrestricted stock</th></tr></thead><tbody>{stock.map(row=><tr key={`${row.material_code}-${row.plant_code}-${row.storage_location_code}`}><td><strong>{row.material_code}</strong></td><td>{nameFor('material',row.material_code)}</td><td>{row.plant_code}</td><td>{row.storage_location_code}</td><td className={styles.number}><strong>{Number(row.quantity)}</strong></td></tr>)}{runtime&&stock.length===0&&<tr><td colSpan={5} className={styles.empty}>No stock positions match this filter.</td></tr>}{!runtime&&<tr><td colSpan={5} className={styles.empty}>Loading inventory…</td></tr>}</tbody></table></div>
    </section>

    <section className={styles.panel}>
      <div className={styles.panelHeader}><div><span className="eyebrow">Material documents</span><h2>Goods receipt movement history</h2></div><span className={styles.liveBadge}>Movement type 101</span></div>
      <div className={styles.tableWrap}><table><thead><tr><th>Material document</th><th>Posting date</th><th>Material</th><th>Plant / Location</th><th>Movement</th><th className={styles.number}>Quantity</th><th>Source PO</th></tr></thead><tbody>{movements.map(d=>{const item=d.items?.[0]??{};return <tr key={d.document_number}><td><Link href={`/documents/${encodeURIComponent(d.document_number)}`}><strong>{d.document_number}</strong></Link></td><td>{String(d.header.posting_date??d.created_at.slice(0,10))}</td><td>{String(item.material??'—')}</td><td>{String(d.header.plant??'—')} / {String(d.header.storage_location??'—')}</td><td>{String(d.header.movement_type??'101')}</td><td className={styles.number}><strong>+{Number(item.received_quantity??0)}</strong></td><td>{String(d.header.source_po??'—')}</td></tr>})}{runtime&&movements.length===0&&<tr><td colSpan={7} className={styles.empty}>No goods receipt movements match this filter.</td></tr>}{!runtime&&<tr><td colSpan={7} className={styles.empty}>Loading movements…</td></tr>}</tbody></table></div>
    </section>
  </main>;
}
