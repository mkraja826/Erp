"use client";

import { FormEvent, useMemo, useState } from "react";

type Props = {
  exercise: {
    id: string;
    title: string;
    instructions: string;
    exercise_type: string;
    max_score: number;
  };
};

type VerifyResult = {
  passed: boolean;
  score: number;
  percentage: number;
  feedback: string;
  hint: string | null;
  missingFields: string[];
};

function parseAnswer(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) return {};

  try {
    return JSON.parse(trimmed);
  } catch {
    if (trimmed.includes("→") || trimmed.includes(",")) {
      return trimmed
        .split(trimmed.includes("→") ? "→" : ",")
        .map((part) => part.trim())
        .filter(Boolean);
    }
    return trimmed;
  }
}

export default function ExerciseCard({ exercise }: Props) {
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [hintLevel, setHintLevel] = useState(0);

  const placeholder = useMemo(() => {
    if (exercise.exercise_type === "transaction") {
      return '{"document_type":"NB","vendor":"...","material":"...","quantity":100,"plant":"...","purchasing_organization":"..."}';
    }
    return "Enter your answer. For ordered steps, separate items with commas or →.";
  }, [exercise.exercise_type]);

  async function verify(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      const response = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exerciseId: exercise.id,
          answer: parseAnswer(answer),
          hintLevel,
        }),
      });
      const data = (await response.json()) as VerifyResult;
      setResult(data);
    } finally {
      setLoading(false);
    }
  }

  async function getHint() {
    const nextLevel = hintLevel + 1;
    setHintLevel(nextLevel);
    const response = await fetch("/api/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ exerciseId: exercise.id, answer: parseAnswer(answer), hintLevel: nextLevel }),
    });
    setResult((await response.json()) as VerifyResult);
  }

  return (
    <section className="lessonExercise">
      <div className="lessonExerciseHeader">
        <span className="eyebrow">Practice</span>
        <span className="scorePill">{exercise.max_score} XP</span>
      </div>
      <h3>{exercise.title}</h3>
      <p>{exercise.instructions}</p>

      <form onSubmit={verify} className="exerciseForm">
        <textarea
          value={answer}
          onChange={(event) => setAnswer(event.target.value)}
          placeholder={placeholder}
          rows={6}
          aria-label="Exercise answer"
        />
        <div className="exerciseActions">
          <button className="primaryButton" type="submit" disabled={loading || !answer.trim()}>
            {loading ? "Verifying…" : "Verify my work"}
          </button>
          <button className="secondaryButton" type="button" onClick={getHint}>
            Give me a hint
          </button>
        </div>
      </form>

      {result && (
        <div className={`verifyResult ${result.passed ? "pass" : "retry"}`}>
          <strong>{result.passed ? "Verified" : "Try again"} · {result.percentage}%</strong>
          <p>{result.feedback}</p>
          {result.missingFields.length > 0 && (
            <p>Missing fields: {result.missingFields.join(", ")}</p>
          )}
          {result.hint && <p className="hintText">AI Coach hint: {result.hint}</p>}
        </div>
      )}
    </section>
  );
}
