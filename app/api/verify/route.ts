import { NextResponse } from "next/server";
import { getSupabaseUser, supabaseRest } from "../../../lib/supabase";

type ExpectedState = { expected?: unknown; hints?: string[]; required_fields?: string[]; aliases?: string[]; accepted?: string[]; explanation?: string };
type ExerciseRow = { id: string; lesson_id: string; max_score: number; expected_state: ExpectedState };
type ProgressRow = { attempts: number; status: string };

function normalizeText(value: string) {
  return value.trim().toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, " ").replace(/\s+/g, " ");
}

function canonicalLearningAnswer(value: string) {
  const normalized = normalizeText(value);
  const knownAliases: Record<string, string> = {
    "gr": "goods receipt",
    "post gr": "goods receipt",
    "post goods receipt": "goods receipt",
    "goods receipt posting": "goods receipt",
  };
  return knownAliases[normalized] ?? normalized;
}

function normalize(value: unknown): unknown {
  if (typeof value === "string") return canonicalLearningAnswer(value);
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, normalize(item)]));
  }
  return value;
}

function scoreAnswer(expected: unknown, answer: unknown, aliases: string[] = []): { score: number; missing: string[] } {
  const expectedNormalized = normalize(expected);
  const answerNormalized = normalize(answer);
  if (typeof expectedNormalized === "string" && typeof answerNormalized === "string") {
    const accepted = [expectedNormalized, ...aliases.map((alias) => canonicalLearningAnswer(alias))];
    return { score: accepted.includes(answerNormalized) ? 100 : 0, missing: [] };
  }
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

function displayAnswer(expected: unknown) {
  if (typeof expected === "string" || typeof expected === "number") return String(expected);
  if (Array.isArray(expected)) return expected.map((item, index) => `${index + 1}. ${String(item)}`).join("\n");
  if (expected && typeof expected === "object") return Object.entries(expected as Record<string, unknown>).map(([key, value]) => `${key.replaceAll("_", " ")}: ${String(value)}`).join(" · ");
  return "Review the lesson example and the expected business result.";
}

export async function POST(request: Request) {
  const body = (await request.json()) as { exerciseId?: string; answer?: unknown; assistanceLevel?: number };
  if (!body.exerciseId) return NextResponse.json({ error: "exerciseId is required" }, { status: 400 });
  const query = new URLSearchParams({ id: `eq.${body.exerciseId}`, select: "id,lesson_id,max_score,expected_state", limit: "1" });
  const rows = await supabaseRest<ExerciseRow[]>(`exercises?${query.toString()}`);
  const exercise = rows[0];
  if (!exercise) return NextResponse.json({ error: "Exercise not found" }, { status: 404 });

  const assistanceLevel = Math.min(Math.max(body.assistanceLevel ?? 0, 0), 3);
  const acceptedAnswers = [...(exercise.expected_state.accepted ?? []), ...(exercise.expected_state.aliases ?? [])];
  const result = scoreAnswer(exercise.expected_state.expected, body.answer, acceptedAnswers);
  const passed = result.score >= 80;
  const score = Math.round((result.score / 100) * exercise.max_score);
  const revealAnswer = !passed && assistanceLevel >= 3;
  const feedback = passed
    ? assistanceLevel === 0 ? "Correct. You solved this independently." : `Correct. You solved this with ${assistanceLevel} hint${assistanceLevel === 1 ? "" : "s"}.`
    : revealAnswer ? "This one is still developing. Study the answer below, then continue — we will check this idea again later." : "Not quite. Try again or use the next hint.";

  const authorization = request.headers.get("authorization");
  const accessToken = authorization?.startsWith("Bearer ") ? authorization.slice(7) : undefined;
  let saved = false;
  if (accessToken) {
    const user = await getSupabaseUser(accessToken);
    if (user) {
      await supabaseRest("exercise_attempts", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ user_id: user.id, exercise_id: exercise.id, submitted_state: body.answer ?? {}, score, result: passed ? "pass" : result.score > 0 ? "partial" : "fail", ai_help_count: assistanceLevel, feedback: { percentage: result.score, missing_fields: result.missing, assistance_level: assistanceLevel, answer_revealed: revealAnswer } }) }, accessToken);
      const progressQuery = new URLSearchParams({ user_id: `eq.${user.id}`, lesson_id: `eq.${exercise.lesson_id}`, select: "attempts,status", limit: "1" });
      const current = await supabaseRest<ProgressRow[]>(`lesson_progress?${progressQuery.toString()}`, {}, accessToken);
      const nextAttempts = (current[0]?.attempts ?? 0) + 1;
      const learningComplete = passed || revealAnswer;
      await supabaseRest("lesson_progress?on_conflict=user_id,lesson_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ user_id: user.id, lesson_id: exercise.lesson_id, status: learningComplete ? "completed" : "in_progress", attempts: nextAttempts, completed_at: learningComplete ? new Date().toISOString() : null, updated_at: new Date().toISOString() }) }, accessToken);
      saved = true;
    }
  }

  return NextResponse.json({ passed, score, percentage: result.score, missingFields: result.missing, feedback, hint: null, saved, lessonId: exercise.lesson_id, learningComplete: passed || revealAnswer, revealedAnswer: revealAnswer ? displayAnswer(exercise.expected_state.expected) : null, explanation: revealAnswer ? (exercise.expected_state.explanation ?? "Compare the expected result with the business event described in the question. The ERP record should reflect what actually happened, not what was merely planned.") : null, assistanceLevel });
}
