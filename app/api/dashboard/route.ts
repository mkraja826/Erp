import { NextResponse } from "next/server";
import { getSupabaseUser, supabaseRest } from "../../../lib/supabase";

type CourseRow = { id: string; slug: string; title: string; module_code: string };
type ModuleRow = { id: string };
type LessonRow = { id: string; title: string; position: number; module_id: string };
type ProgressRow = { lesson_id: string; status: string; attempts: number };
type AttemptRow = { score: number; ai_help_count: number };
type AiHelpRow = { id: string };

export async function GET(request: Request) {
  const authorization = request.headers.get("authorization");
  const accessToken = authorization?.startsWith("Bearer ") ? authorization.slice(7) : undefined;
  if (!accessToken) return NextResponse.json({ authenticated: false }, { status: 401 });

  const user = await getSupabaseUser(accessToken);
  if (!user) return NextResponse.json({ authenticated: false }, { status: 401 });

  const courseRows = await supabaseRest<CourseRow[]>(
    "courses?slug=eq.sap-mm-level-1&is_published=eq.true&select=id,slug,title,module_code&limit=1",
    {},
    accessToken
  );
  const course = courseRows[0];
  if (!course) return NextResponse.json({ error: "Course not found" }, { status: 404 });

  const modules = await supabaseRest<ModuleRow[]>(
    `course_modules?course_id=eq.${course.id}&select=id&order=position.asc`,
    {},
    accessToken
  );
  const moduleIds = modules.map((item) => item.id);
  const lessons = moduleIds.length
    ? await supabaseRest<LessonRow[]>(
        `lessons?module_id=in.(${moduleIds.join(",")})&select=id,title,position,module_id&order=position.asc`,
        {},
        accessToken
      )
    : [];

  const progress = await supabaseRest<ProgressRow[]>(
    `lesson_progress?user_id=eq.${user.id}&select=lesson_id,status,attempts`,
    {},
    accessToken
  );
  const attempts = await supabaseRest<AttemptRow[]>(
    `exercise_attempts?user_id=eq.${user.id}&select=score,ai_help_count`,
    {},
    accessToken
  );
  const aiEvents = await supabaseRest<AiHelpRow[]>(
    `ai_help_events?user_id=eq.${user.id}&select=id`,
    {},
    accessToken
  );

  const completedSet = new Set(progress.filter((row) => row.status === "completed").map((row) => row.lesson_id));
  const completedLessons = lessons.filter((lesson) => completedSet.has(lesson.id)).length;
  const totalLessons = lessons.length;
  const progressPercent = totalLessons === 0 ? 0 : Math.round((completedLessons / totalLessons) * 100);
  const isComplete = totalLessons > 0 && completedLessons === totalLessons;
  const nextLesson = lessons.find((lesson) => !completedSet.has(lesson.id)) ?? lessons.at(-1) ?? null;
  const xp = attempts.reduce((sum, row) => sum + row.score, 0);
  const totalAttempts = progress.reduce((sum, row) => sum + row.attempts, 0);
  const aiHelpUsage = aiEvents.length + attempts.reduce((sum, row) => sum + row.ai_help_count, 0);

  await supabaseRest(
    "enrollments?on_conflict=user_id,course_id",
    {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({
        user_id: user.id,
        course_id: course.id,
        status: isComplete ? "completed" : "active",
        progress_percent: progressPercent,
        completed_at: isComplete ? new Date().toISOString() : null,
      }),
    },
    accessToken
  );

  return NextResponse.json({
    authenticated: true,
    learner: { id: user.id, email: user.email ?? null },
    course,
    stats: {
      progressPercent,
      completedLessons,
      totalLessons,
      xp,
      attempts: totalAttempts,
      aiHelpUsage,
    },
    nextLesson,
    workLabUnlocked: isComplete,
  });
}
