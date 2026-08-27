import { supabaseRest } from "./supabase";

export type Exercise = {
  id: string;
  title: string;
  instructions: string;
  exercise_type: "transaction" | "configuration" | "scenario" | "quiz";
  max_score: number;
};

export type Lesson = {
  id: string;
  title: string;
  summary: string | null;
  lesson_type: "concept" | "demo" | "practice" | "challenge";
  estimated_minutes: number;
  position: number;
  content: Record<string, unknown>;
  exercises: Exercise[];
};

export type CourseModule = {
  id: string;
  title: string;
  description: string | null;
  position: number;
  lessons: Lesson[];
};

export type Course = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  module_code: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  course_modules: CourseModule[];
};

export async function getPublishedCourse(slug: string): Promise<Course | null> {
  const query = new URLSearchParams({
    slug: `eq.${slug}`,
    is_published: "eq.true",
    select:
      "id,slug,title,description,module_code,difficulty,course_modules(id,title,description,position,lessons(id,title,summary,lesson_type,estimated_minutes,position,content,exercises(id,title,instructions,exercise_type,max_score)))",
  });

  const rows = await supabaseRest<Course[]>(`courses?${query.toString()}`);
  const course = rows[0] ?? null;

  if (!course) return null;

  course.course_modules.sort((a, b) => a.position - b.position);
  for (const module of course.course_modules) {
    module.lessons.sort((a, b) => a.position - b.position);
  }

  return course;
}
