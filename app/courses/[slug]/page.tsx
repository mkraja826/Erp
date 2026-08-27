import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublishedCourse } from "../../../lib/learning";
import ExerciseCard from "./ExerciseCard";
import LessonGate from "./LessonGate";

type PageProps = { params: Promise<{ slug: string }> };

export default async function CoursePage({ params }: PageProps) {
  const { slug } = await params;
  const course = await getPublishedCourse(slug);
  if (!course) notFound();

  const lessons = course.course_modules.flatMap((module) => module.lessons.map((lesson) => ({ ...lesson, moduleTitle: module.title })));
  const totalMinutes = lessons.reduce((sum, lesson) => sum + lesson.estimated_minutes, 0);

  return (
    <main className="coursePage">
      <header className="courseTopbar">
        <Link href="/" className="brandLink">ERP Edu</Link>
        <div className="courseTopActions"><span className="courseBadge">{course.module_code} · {course.difficulty}</span><Link href="/auth" className="secondaryButton">Learner account</Link></div>
      </header>

      <section className="courseHero">
        <div><span className="eyebrow">Live learning path</span><h1>{course.title}</h1><p>{course.description}</p></div>
        <div className="courseStats"><div><strong>{course.course_modules.length}</strong><span>Modules</span></div><div><strong>{lessons.length}</strong><span>Lessons</span></div><div><strong>{totalMinutes}</strong><span>Minutes</span></div></div>
      </section>

      <section className="learningRule"><strong>How this works</strong><span>Understand → Try → Get a hint if stuck → Verify → Move forward</span></section>

      <div className="courseContent">
        {course.course_modules.map((module) => (
          <section className="courseModule" key={module.id}>
            <div className="moduleHeading"><span className="moduleNumber">{String(module.position).padStart(2, "0")}</span><div><h2>{module.title}</h2>{module.description && <p>{module.description}</p>}</div></div>

            {module.lessons.map((lesson) => {
              const content = lesson.content as { goal?: string; body?: string; scenario?: string };
              const lessonIndex = lessons.findIndex((item) => item.id === lesson.id);
              const previousLessonId = lessonIndex > 0 ? lessons[lessonIndex - 1].id : undefined;
              return (
                <LessonGate key={lesson.id} lessonId={lesson.id} previousLessonId={previousLessonId}>
                  <article className="lessonCard">
                    <div className="lessonMeta"><span>{lesson.lesson_type}</span><span>{lesson.estimated_minutes} min</span></div>
                    <h3>{lesson.title}</h3>
                    {content.goal && <p className="lessonGoal"><strong>Goal:</strong> {content.goal}</p>}
                    {content.body && <p>{content.body}</p>}
                    {content.scenario && <div className="scenarioBox"><strong>Business scenario</strong><p>{content.scenario}</p></div>}
                    {lesson.exercises.map((exercise) => <ExerciseCard key={exercise.id} exercise={exercise} />)}
                  </article>
                </LessonGate>
              );
            })}
          </section>
        ))}
      </div>

      <section className="workLabTeaser"><span className="eyebrow">After course completion</span><h2>Your Work Lab unlocks next</h2><p>Training guidance reduces and you start handling realistic junior SAP MM tasks like an employee.</p></section>
    </main>
  );
}
