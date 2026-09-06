"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getValidSession, refreshSession, signOut } from "../../lib/auth-client";

type CourseCardData = {
  course: { title: string; slug: string; module_code: string };
  stats: { progressPercent: number; completedLessons: number; totalLessons: number };
  nextLesson: { id: string; title: string } | null;
  complete: boolean;
  unlocked?: boolean;
};

type DashboardData = {
  learner: { email: string | null };
  foundation: CourseCardData;
  mm: CourseCardData;
  totals: { xp: number; attempts: number; aiHelpUsage: number };
  workLabUnlocked: boolean;
  workplace: { competencyProfile: boolean; overall: number; managerReview: boolean; recommendation: string; finalCertification: boolean };
};

function recommendationLabel(value:string){return value==="recommended"?"Recommended":value==="recommended_with_supervision"?"Recommended with supervision":value==="not_yet_ready"?"Not yet ready":"Not reviewed";}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      let session = await getValidSession();
      if (!session) { window.location.href = "/auth"; return; }
      try {
        let response = await fetch("/api/dashboard", { headers: { Authorization: `Bearer ${session.access_token}` } });
        if (response.status === 401) {
          session = await refreshSession(session);
          if (!session) { window.location.href = "/auth"; return; }
          response = await fetch("/api/dashboard", { headers: { Authorization: `Bearer ${session.access_token}` } });
        }
        if (response.status === 401) { signOut(); window.location.href = "/auth"; return; }
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Unable to load dashboard.");
        setData(payload as DashboardData);
      } catch (err) { setError(err instanceof Error ? err.message : "Unable to load dashboard."); }
      finally { setLoading(false); }
    }
    load();
  }, []);

  if (loading) return <main className="dashboardPage"><p>Loading your learning progress…</p></main>;
  if (error || !data) return <main className="dashboardPage"><p>{error || "Dashboard unavailable."}</p></main>;

  const current = data.foundation.complete ? data.mm : data.foundation;
  const totalCompleted = data.foundation.stats.completedLessons + data.mm.stats.completedLessons;
  const pathStage = data.workplace.finalCertification ? 6 : data.workplace.managerReview ? 5 : data.workplace.competencyProfile ? 4 : data.workLabUnlocked ? 3 : data.foundation.complete ? 2 : 1;

  return <main className="dashboardPage">
    <header className="dashboardTopbar"><Link href="/" className="brandLink">ERP Edu</Link><div className="dashboardUser"><span>{data.learner.email}</span><button className="ghostButton" onClick={() => { signOut(); window.location.href = "/"; }}>Sign out</button></div></header>

    <section className="dashboardHero"><div><span className="eyebrow">Your ERP career path</span><h1>Learn → Practice → Prove workplace readiness.</h1><p>Follow one clear path from SAP basics to realistic ERP work and final workplace certification.</p></div><div className="dashboardProgress"><strong>{data.workplace.finalCertification ? "✓" : `${current.stats.progressPercent}%`}</strong><span>{data.workplace.finalCertification ? "Workplace certified" : current.course.title}</span></div></section>

    <section className="dashboardCourseCard" aria-label="Learning path progress">
      <span className="eyebrow">Progress roadmap</span>
      <div className="dashboardStats">
        <article><strong>{pathStage >= 1 ? "✓" : "1"}</strong><span>Foundations</span></article>
        <article><strong>{pathStage >= 2 ? "✓" : "2"}</strong><span>SAP MM</span></article>
        <article><strong>{pathStage >= 3 ? "✓" : "3"}</strong><span>Work Lab</span></article>
        <article><strong>{pathStage >= 4 ? "✓" : "4"}</strong><span>Competency</span></article>
        <article><strong>{pathStage >= 5 ? "✓" : "5"}</strong><span>Manager review</span></article>
        <article><strong>{pathStage >= 6 ? "✓" : "6"}</strong><span>Certification</span></article>
      </div>
    </section>

    <section className="dashboardGrid">
      <div style={{ display: "grid", gap: "1rem" }}>
        <article className="dashboardCourseCard">
          <span className="courseBadge">1 · START HERE</span>
          <h2>{data.foundation.course.title}</h2>
          <p>Learn ERP, SAP, modules, business processes, and SAP data basics before starting SAP MM.</p>
          <div className="progressTrack"><div className="progressFill" style={{ width: `${data.foundation.stats.progressPercent}%` }} /></div>
          <p>{data.foundation.stats.completedLessons} of {data.foundation.stats.totalLessons} lessons verified</p>
          <Link className="primaryButton" href={`/courses/${data.foundation.course.slug}`}>{data.foundation.stats.progressPercent > 0 ? "Continue SAP Foundations" : "Start SAP Foundations"}</Link>
        </article>

        <article className={`dashboardCourseCard ${data.mm.unlocked ? "" : "locked"}`}>
          <span className="courseBadge">2 · SAP MM</span>
          <h2>{data.mm.course.title}</h2>
          <p>{data.mm.unlocked ? "Foundations complete. Continue into SAP Materials Management." : "Complete SAP Foundations first to unlock this course."}</p>
          <div className="progressTrack"><div className="progressFill" style={{ width: `${data.mm.stats.progressPercent}%` }} /></div>
          <p>{data.mm.stats.completedLessons} of {data.mm.stats.totalLessons} lessons verified</p>
          {data.mm.unlocked ? <Link className="primaryButton" href={`/courses/${data.mm.course.slug}`}>{data.mm.stats.progressPercent > 0 ? "Continue SAP MM" : "Start SAP MM Level 1"}</Link> : <span className="workGateStatus">Locked until SAP Foundations is complete</span>}
        </article>
      </div>

      <div className="dashboardStats"><article><strong>{data.totals.xp}</strong><span>Verified XP</span></article><article><strong>{data.totals.attempts}</strong><span>Practice attempts</span></article><article><strong>{data.totals.aiHelpUsage}</strong><span>AI help uses</span></article><article><strong>{totalCompleted}</strong><span>Lessons mastered</span></article></div>
    </section>

    <section className="dashboardLowerGrid"><article className="nextStepCard"><span className="eyebrow">Next best action</span><h2>{data.workplace.finalCertification ? "Final workplace certification complete" : data.workplace.managerReview ? "Complete your workplace certification" : data.workplace.competencyProfile ? "Review your employability evidence" : data.workLabUnlocked ? "Enter your workplace simulation" : current.nextLesson?.title ?? "Continue your learning path"}</h2><p>{data.workplace.finalCertification ? "Your workplace evidence chain is complete and recorded." : data.workplace.managerReview ? `Manager outcome: ${recommendationLabel(data.workplace.recommendation)}.` : data.workplace.competencyProfile ? `Current competency score: ${data.workplace.overall}.` : data.workLabUnlocked ? "Work realistic tickets, resolve incidents, and build evidence for readiness." : "Your saved progress stays with your account."}</p><div className="exerciseActions">{!data.workLabUnlocked ? <><Link className="secondaryButton" href="/courses/sap-foundations">SAP Foundations</Link>{data.mm.unlocked && <Link className="secondaryButton" href="/courses/sap-mm-level-1">SAP MM Level 1</Link>}</> : <><Link className="secondaryButton" href="/work-lab/inbox">Workplace inbox</Link><Link className="secondaryButton" href="/skills">Competency profile</Link><Link className="secondaryButton" href="/work-lab/manager-review">Manager review</Link><Link className="primaryButton" href="/work-lab/final-certification">Final certification</Link></>}</div></article><article className={`workGateCard ${data.workLabUnlocked ? "unlocked" : "locked"}`}><span className="eyebrow">Workplace readiness</span><h2>{data.workplace.finalCertification ? "Certified" : data.workLabUnlocked ? recommendationLabel(data.workplace.recommendation) : "Complete the learning path first"}</h2><p>{data.workLabUnlocked ? `Competency ${data.workplace.overall || 0}/100 · ${data.workplace.managerReview ? "Manager review recorded" : "Manager review pending"}.` : "Finish SAP Foundations and SAP MM Level 1 before entering workplace simulation."}</p>{data.workLabUnlocked ? <Link className="primaryButton" href="/work-lab/inbox">Open workplace inbox</Link> : <span className="workGateStatus">Foundations → SAP MM → Work Lab</span>}</article></section>
  </main>;
}
