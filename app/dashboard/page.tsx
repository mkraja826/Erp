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
};

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

  return <main className="dashboardPage">
    <header className="dashboardTopbar"><Link href="/" className="brandLink">ERP Edu</Link><div className="dashboardUser"><span>{data.learner.email}</span><button className="ghostButton" onClick={() => { signOut(); window.location.href = "/"; }}>Sign out</button></div></header>

    <section className="dashboardHero"><div><span className="eyebrow">Learner dashboard</span><h1>Start with SAP Foundations. Then learn SAP MM.</h1><p>Build the basics first, then move into Materials Management and realistic ERP work.</p></div><div className="dashboardProgress"><strong>{current.stats.progressPercent}%</strong><span>{current.course.title}</span></div></section>

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

    <section className="dashboardLowerGrid"><article className="nextStepCard"><span className="eyebrow">Next step</span><h2>{current.nextLesson?.title ?? (data.foundation.complete ? "SAP MM Level 1 completed" : "SAP Foundations completed")}</h2><p>{current.nextLesson ? `Continue in ${current.course.title}. Your saved progress stays with your account.` : data.foundation.complete ? "Move into independent ERP practice." : "SAP MM Level 1 is now unlocked."}</p><div className="exerciseActions"><Link className="secondaryButton" href="/courses/sap-foundations">SAP Foundations</Link>{data.mm.unlocked && <Link className="secondaryButton" href="/courses/sap-mm-level-1">SAP MM Level 1</Link>}<Link className="secondaryButton" href="/skills">Verified skills</Link>{data.workLabUnlocked&&<Link className="primaryButton" href="/job-readiness">Job-readiness assessment</Link>}</div></article><article className={`workGateCard ${data.workLabUnlocked ? "unlocked" : "locked"}`}><span className="eyebrow">Work Lab</span><h2>{data.workLabUnlocked ? "Work environment unlocked" : "Complete the learning path first"}</h2><p>{data.workLabUnlocked ? "You can now perform realistic junior SAP MM tickets, investigate incidents, and attempt the independent readiness gate." : "Finish SAP Foundations and SAP MM Level 1 before entering the workplace simulation."}</p>{data.workLabUnlocked ? <Link className="primaryButton" href="/work-lab">Enter Work Lab</Link> : <span className="workGateStatus">Foundations → SAP MM → Work Lab</span>}</article></section>
  </main>;
}
