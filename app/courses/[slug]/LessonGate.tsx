"use client";

import { ReactNode, useEffect, useState } from "react";
import { getStoredSession } from "../../../lib/auth-client";

type Props = {
  lessonId: string;
  previousLessonId?: string;
  children: ReactNode;
};

export default function LessonGate({ lessonId, previousLessonId, children }: Props) {
  const [locked, setLocked] = useState(Boolean(previousLessonId));
  const [checking, setChecking] = useState(Boolean(previousLessonId));

  useEffect(() => {
    async function check() {
      if (!previousLessonId) {
        setLocked(false);
        setChecking(false);
        return;
      }
      const session = getStoredSession();
      if (!session) {
        setLocked(true);
        setChecking(false);
        return;
      }
      const response = await fetch(`/api/progress?lessonIds=${previousLessonId},${lessonId}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await response.json() as { completedLessonIds?: string[] };
      setLocked(!(data.completedLessonIds ?? []).includes(previousLessonId));
      setChecking(false);
    }

    check();
    const onCompleted = (event: Event) => {
      const detail = (event as CustomEvent<{ lessonId: string }>).detail;
      if (detail?.lessonId === previousLessonId) setLocked(false);
    };
    window.addEventListener("erp-lesson-completed", onCompleted);
    window.addEventListener("erp-auth-change", check);
    return () => {
      window.removeEventListener("erp-lesson-completed", onCompleted);
      window.removeEventListener("erp-auth-change", check);
    };
  }, [lessonId, previousLessonId]);

  if (checking) return <div className="lessonLocked">Checking your saved progress…</div>;
  if (locked) return <div className="lessonLocked"><strong>Lesson locked</strong><span>Complete and verify the previous lesson to unlock this one.</span></div>;
  return <>{children}</>;
}
