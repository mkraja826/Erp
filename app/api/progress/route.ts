import { NextResponse } from "next/server";
import { getSupabaseUser, supabaseRest } from "../../../lib/supabase";

type ProgressRow = { lesson_id: string; status: string; attempts: number };

export async function GET(request: Request) {
  const authorization = request.headers.get("authorization");
  const accessToken = authorization?.startsWith("Bearer ") ? authorization.slice(7) : undefined;
  if (!accessToken) return NextResponse.json({ authenticated: false, completedLessonIds: [] });

  const user = await getSupabaseUser(accessToken);
  if (!user) return NextResponse.json({ authenticated: false, completedLessonIds: [] }, { status: 401 });

  const url = new URL(request.url);
  const ids = url.searchParams.get("lessonIds")?.split(",").filter(Boolean) ?? [];
  const params = new URLSearchParams({ select: "lesson_id,status,attempts", user_id: `eq.${user.id}` });
  if (ids.length > 0) params.set("lesson_id", `in.(${ids.join(",")})`);

  const rows = await supabaseRest<ProgressRow[]>(`lesson_progress?${params.toString()}`, {}, accessToken);
  return NextResponse.json({
    authenticated: true,
    completedLessonIds: rows.filter((row) => row.status === "completed").map((row) => row.lesson_id),
    progress: rows,
  });
}
