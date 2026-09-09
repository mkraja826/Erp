import { NextResponse } from "next/server";
import { supabaseRest } from "../../../lib/supabase";

type ExpectedState = { expected?: unknown; question_type?: string; options?: string[] };
type Row = { id: string; exercise_type: string; expected_state: ExpectedState };

function labelFor(key: string) {
  return key.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function fieldType(key: string, value: unknown) {
  if (typeof value === "number" || key.includes("quantity") || key.includes("value") || key.includes("price")) return "number";
  return "text";
}

function hashSeed(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function stableShuffle(options: string[], seedText: string) {
  const items = [...options];
  let seed = hashSeed(seedText) || 1;
  const nextRandom = () => {
    seed = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    seed ^= seed + Math.imul(seed ^ (seed >>> 7), 61 | seed);
    return ((seed ^ (seed >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(nextRandom() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const exerciseId = url.searchParams.get("exerciseId");
  if (!exerciseId) return NextResponse.json({ error: "exerciseId is required" }, { status: 400 });

  const rows = await supabaseRest<Row[]>(`exercises?id=eq.${exerciseId}&select=id,exercise_type,expected_state&limit=1`);
  const row = rows[0];
  if (!row) return NextResponse.json({ error: "Exercise not found" }, { status: 404 });

  if (row.expected_state?.question_type === "multiple_choice" && row.expected_state.options?.length) {
    return NextResponse.json({ mode: "multiple-choice", options: stableShuffle(row.expected_state.options, row.id), fields: [] });
  }

  if (row.expected_state?.question_type === "fill_blank") {
    return NextResponse.json({ mode: "single", fields: [{ key: "answer", label: "Short answer", type: "text" }] });
  }

  const expected = row.expected_state?.expected;
  if (Array.isArray(expected)) {
    return NextResponse.json({ mode: "ordered-list", items: expected.length, fields: [] });
  }

  if (expected && typeof expected === "object") {
    const fields = Object.entries(expected as Record<string, unknown>).map(([key, value]) => ({
      key,
      label: labelFor(key),
      type: fieldType(key, value),
    }));
    return NextResponse.json({ mode: "form", fields });
  }

  return NextResponse.json({ mode: "single", fields: [{ key: "answer", label: "Answer", type: "text" }] });
}
