"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getStoredSession, signOut } from "../../lib/auth-client";

type DashboardData = {
  learner: { email: string | null };
  course: { title: string; slug: string; module_code: string };
  stats: { progressPercent: number; completedLessons: number; totalLessons: number; xp: number; attempts: number; aiHelpUsage: number };
  nextLesson: { id: string; title: string } | null;
  workLabUnlocked: boolean;
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      const session = getStoredSession();
      if (!session) { window.location.href = "/auth"; return; }
      try {
        const response = await fetch("/api/dashboard", { headers: { Authorization: `Bearer ${session.access_token}` } });
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

  return <main className="dashboardPage">
    <header className="dashboardTopbar"><Link href="/" className="brandLink">ERP Edu</Link><div className="dashboardUser"><span>{data.learner.email}</span><button className="ghostButton" onClick={() => { signOut(); window.location.href = "/"; }}>Sign out</button></div></header>
    <section className="dashboardHero"><div><span className="eyebrow">Learner dashboard</span><h1>Keep moving. You’re building real SAP skill.</h1><p>Your progress is based on verified practice, not just lessons viewed.</p></div><div className="dashboardProgress"><strong>{data.stats.progressPercent}%</strong><span>Course complete</span></div></section>
    <section className="dashboardGrid"><article className="dashboardCourseCard"><span className="courseBadge">{data.course.module_code}</span><h2>{data.course.title}</h2><div className="progressTrack"><div className="progressFill" style={{ width: `${data.stats.progressPercent}%` }} /></div><p>{data.stats.completedLessons} of {data.stats.totalLessons} lessons verified</p><Link className="primaryButton" href={`/courses/${data.course.slug}`}>{data.stats.progressPercent > 0 ? "Continue learning" : "Start course"}</Link></article><div className="dashboardStats"><article><strong>{data.stats.xp}</strong><span>Verified XP</span></article><article><strong>{data.stats.attempts}</strong><span>Practice attempts</span></article><article><strong>{data.stats.aiHelpUsage}</strong><span>AI help uses</span></article><article><strong>{data.stats.completedLessons}</strong><span>Lessons mastered</span></article></div></section>
    <section className="dashboardLowerGrid"><article className="nextStepCard"><span className="eyebrow">Next step</span><h2>{data.nextLesson?.title ?? "Course completed"}</h2><p>{data.nextLesson ? "Continue from your first unverified lesson. Your saved progress stays with your account." : "You have verified every lesson in this course."}</p><div className="exerciseActions"><Link className="secondaryButton" href={`/courses/${data.course.slug}`}>Open learning path</Link><Link className="secondaryButton" href="/procurement-flow">Open Procure-to-Pay simulator</Link><Link className="secondaryButton" href="/skills">Verified skills & certificate</Link></div></article><article className={`workGateCard ${data.workLabUnlocked ? "unlocked" : "locked"}`}><span className="eyebrow">Work Lab</span><h2>{data.workLabUnlocked ? "Work environment unlocked" : "Locked until course completion"}</h2><p>{data.workLabUnlocked ? "You can now move from guided learning into realistic junior SAP MM tickets and business cases." : `Complete the remaining ${data.stats.totalLessons - data.stats.completedLessons} verified lesson(s) to unlock the simulated workplace.`}</p>{data.workLabUnlocked ? <Link className="primaryButton" href="/work-lab">Enter Work Lab</Link> : <span className="workGateStatus">{data.stats.progressPercent}% complete</span>}</article></section>
  </main>;
}