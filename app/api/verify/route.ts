import { NextResponse } from "next/server";
import { supabaseRest } from "../../../lib/supabase";

type ExpectedState = {
  expected?: unknown;
  hints?: string[];
  required_fields?: string[];
};

type ExerciseRow = {
  id: string;
  max_score: number;
  expected_state: ExpectedState;
};

function normalize(value: unknown): unknown {
  if (typeof value === "string") return value.trim().toLowerCase();
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, normalize(item)])
    );
  }
  return value;
}

function scoreAnswer(expected: unknown, answer: unknown): { score: number; missing: string[] } {
  const expectedNormalized = normalize(expected);
  const answerNormalized = normalize(answer);

  if (Array.isArray(expectedNormalized) && Array.isArray(answerNormalized)) {
    const correct = expectedNormalized.reduce(
      (count, item, index) => count + (JSON.stringify(item) === JSON.stringify(answerNormalized[index]) ? 1 : 0),
      0
    );
    return { score: Math.round((correct / Math.max(expectedNormalized.length, 1)) * 100), missing: [] };
  }

  if (
    expectedNormalized &&
    typeof expectedNormalized === "object" &&
    !Array.isArray(expectedNormalized) &&
    answerNormalized &&
    typeof answerNormalized === "object" &&
    !Array.isArray(answerNormalized)
  ) {
    const expectedObject = expectedNormalized as Record<string, unknown>;
    const answerObject = answerNormalized as Record<string, unknown>;
    const keys = Object.keys(expectedObject);
    const missing = keys.filter((key) => !(key in answerObject) || answerObject[key] === "");
    const correct = keys.reduce(
      (count, key) => count + (JSON.stringify(expectedObject[key]) === JSON.stringify(answerObject[key]) ? 1 : 0),
      0
    );
    return { score: Math.round((correct / Math.max(keys.length, 1)) * 100), missing };
  }

  return {
    score: JSON.stringify(expectedNormalized) === JSON.stringify(answerNormalized) ? 100 : 0,
    missing: [],
  };
}

export async function POST(request: Request) {
  const body = (await request.json()) as { exerciseId?: string; answer?: unknown; hintLevel?: number };

  if (!body.exerciseId) {
    return NextResponse.json({ error: "exerciseId is required" }, { status: 400 });
  }

  const query = new URLSearchParams({
    id: `eq.${body.exerciseId}`,
    select: "id,max_score,expected_state",
    limit: "1",
  });

  const rows = await supabaseRest<ExerciseRow[]>(`exercises?${query.toString()}`);
  const exercise = rows[0];

  if (!exercise) {
    return NextResponse.json({ error: "Exercise not found" }, { status: 404 });
  }

  const result = scoreAnswer(exercise.expected_state.expected, body.answer);
  const passed = result.score >= 80;
  const hints = exercise.expected_state.hints ?? [];
  const requestedHint = Math.min(Math.max(body.hintLevel ?? 0, 0), Math.max(hints.length - 1, 0));

  return NextResponse.json({
    passed,
    score: Math.round((result.score / 100) * exercise.max_score),
    percentage: result.score,
    missingFields: result.missing,
    feedback: passed
      ? "Verified. You completed this task successfully."
      : "Not verified yet. Review the highlighted values and try again.",
    hint: passed || hints.length === 0 ? null : hints[requestedHint],
  });
}
