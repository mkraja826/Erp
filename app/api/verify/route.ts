import { NextResponse } from "next/server";
import { getSupabaseUser, supabaseRest } from "../../../lib/supabase";

type ExpectedState = { expected?: unknown; hints?: string[]; required_fields?: string[] };
type ExerciseRow = { id: string; lesson_id: string; max_score: number; expected_state: ExpectedState };
type ProgressRow = { attempts: number; status: string };

function normalize(value: unknown): unknown {
  if (typeof value === "string") return value.trim().toLowerCase();
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, normalize(item)]));
  }
  return value;
}

function scoreAnswer(expected: unknown, answer: unknown): { score: number; missing: string[] } {
  const expectedNormalized = normalize(expected);
  const answerNormalized = normalize(answer);
  if (Array.isArray(expectedNormalized) && Array.isArray(answerNormalized)) {
    const correct = expectedNormalized.reduce((count, item, index) => count + (JSON.stringify(item) === JSON.stringify(answerNormalized[index]) ? 1 : 0), 0);
    return { score: Math.round((correct / Math.max(expectedNormalized.length, 1)) * 100), missing: [] };
  }
  if (expectedNormalized && typeof expectedNormalized === "object" && !Array.isArray(expectedNormalized) && answerNormalized && typeof answerNormalized === "object" && !Array.isArray(answerNormalized)) {
    const expectedObject = expectedNormalized as Record<string, unknown>;
    const answerObject = answerNormalized as Record<string, unknown>;
    const keys = Object.keys(expectedObject);
    const missing = keys.filter((key) => !(key in answerObject) || answerObject[key] === "");
    const correct = keys.reduce((count, key) => count + (JSON.stringify(expectedObject[key]) === JSON.stringify(answerObject[key]) ? 1 : 0), 0);
    return { score: Math.round((correct / Math.max(keys.length, 1)) * 100), missing };
  }
  return { score: JSON.stringify(expectedNormalized) === JSON.stringify(answerNormalized) ? 100 : 0, missing: [] };
}

export async function POST(request: Request) {
  const body = (await request.json()) as { exerciseId?: string; answer?: unknown; hintLevel?: number };
  if (!body.exerciseId) return NextResponse.json({ error: "exerciseId is required" }, { status: 400 });

  const query = new URLSearchParams({ id: `eq.${body.exerciseId}`, select: "id,lesson_id,max_score,expected_state", limit: "1" });
  const rows = await supabaseRest<ExerciseRow[]>(`exercises?${query.toString()}`);
  const exercise = rows[0];
  if (!exercise) return NextResponse.json({ error: "Exercise not found" }, { status: 404 });

  const result = scoreAnswer(exercise.expected_state.expected, body.answer);
  const passed = result.score >= 80;
  const hints = exercise.expected_state.hints ?? [];
  const requestedHint = Math.min(Math.max(body.hintLevel ?? 0, 0), Math.max(hints.length - 1, 0));
  const score = Math.round((result.score / 100) * exercise.max_score);
  const feedback = passed ? "Verified. You completed this task successfully." : "Not verified yet. Review the highlighted values and try again.";

  const authorization = request.headers.get("authorization");
  const accessToken = authorization?.startsWith("Bearer ") ? authorization.slice(7) : undefined;
  let saved = false;

  if (accessToken && body.hintLevel === undefined) {
    const user = await getSupabaseUser(accessToken);
    if (user) {
      await supabaseRest("exercise_attempts", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          user_id: user.id,
          exercise_id: exercise.id,
          submitted_state: body.answer ?? {},
          score,
          result: passed ? "pass" : result.score > 0 ? "partial" : "fail",
          ai_help_count: 0,
          feedback: { percentage: result.score, missing_fields: result.missing },
        }),
      }, accessToken);

      const progressQuery = new URLSearchParams({ user_id: `eq.${user.id}`, lesson_id: `eq.${exercise.lesson_id}`, select: "attempts,status", limit: "1" });
      const current = await supabaseRest<ProgressRow[]>(`lesson_progress?${progressQuery.toString()}`, {}, accessToken);
      const nextAttempts = (current[0]?.attempts ?? 0) + 1;
      await supabaseRest("lesson_progress?on_conflict=user_id,lesson_id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({
          user_id: user.id,
          lesson_id: exercise.lesson_id,
          status: passed ? "completed" : "in_progress",
          attempts: nextAttempts,
          completed_at: passed ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        }),
      }, accessToken);
      saved = true;
    }
  }

  return NextResponse.json({
    passed,
    score,
    percentage: result.score,
    missingFields: result.missing,
    feedback,
    hint: passed || hints.length === 0 ? null : hints[requestedHint],
    saved,
    lessonId: exercise.lesson_id,
  });
}
