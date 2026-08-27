import { NextResponse } from "next/server";
import { supabaseRest } from "../../../lib/supabase";

type Row = { id: string; exercise_type: string; expected_state: { expected?: unknown } };

function labelFor(key: string) {
  return key.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function fieldType(key: string, value: unknown) {
  if (typeof value === "number" || key.includes("quantity") || key.includes("value") || key.includes("price")) return "number";
  return "text";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const exerciseId = url.searchParams.get("exerciseId");
  if (!exerciseId) return NextResponse.json({ error: "exerciseId is required" }, { status: 400 });

  const rows = await supabaseRest<Row[]>(`exercises?id=eq.${exerciseId}&select=id,exercise_type,expected_state&limit=1`);
  const row = rows[0];
  if (!row) return NextResponse.json({ error: "Exercise not found" }, { status: 404 });

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
