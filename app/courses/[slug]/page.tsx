import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublishedCourse } from "../../../lib/learning";
import ExerciseCard from "./ExerciseCard";
import LessonGate from "./LessonGate";

type PageProps = { params: Promise<{ slug: string }> };
type LessonContent = {
  goal?: string;
  body?: string;
  scenario?: string;
  whyItMatters?: string;
  keyTerms?: Array<{ term: string; meaning: string }>;
  commonMistake?: string;
  quickCheck?: string;
  remember?: string;
};

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
        <div className="courseTopActions"><span className="courseBadge">{course.module_code} · {course.difficulty}</span><Link href="/dashboard" className="secondaryButton">Dashboard</Link></div>
      </header>

      <section className="courseHero">
        <div><span className="eyebrow">Beginner learning path</span><h1>{course.title}</h1><p>{course.description}</p></div>
        <div className="courseStats"><div><strong>{course.course_modules.length}</strong><span>Modules</span></div><div><strong>{lessons.length}</strong><span>Lessons</span></div><div><strong>{totalMinutes}</strong><span>Minutes</span></div></div>
      </section>

      <section className="learningRule"><strong>One small step at a time</strong><span>Understand why → See a business example → Try it yourself → Ask AI only if stuck → Verify</span></section>

      <div className="courseContent">
        {course.course_modules.map((module) => (
          <section className="courseModule" key={module.id}>
            <div className="moduleHeading"><span className="moduleNumber">{String(module.position).padStart(2, "0")}</span><div><span className="moduleEyebrow">Module {module.position}</span><h2>{module.title}</h2>{module.description && <p>{module.description}</p>}</div></div>

            {module.lessons.map((lesson) => {
              const content = lesson.content as LessonContent;
              const lessonIndex = lessons.findIndex((item) => item.id === lesson.id);
              const previousLessonId = lessonIndex > 0 ? lessons[lessonIndex - 1].id : undefined;
              const whyItMatters = content.whyItMatters ?? lesson.summary;
              const remember = content.remember ?? content.goal;
              return (
                <LessonGate key={lesson.id} lessonId={lesson.id} previousLessonId={previousLessonId}>
                  <article className="lessonCard">
                    <div className="lessonMeta"><span>{lesson.lesson_type}</span><span>{lesson.estimated_minutes} min</span><span>Lesson {lessonIndex + 1} of {lessons.length}</span></div>
                    <h3>{lesson.title}</h3>

                    {whyItMatters && <section className="microBlock whyBlock"><span className="microLabel">Why this matters</span><p>{whyItMatters}</p></section>}
                    {content.goal && <p className="lessonGoal"><strong>By the end:</strong> {content.goal}</p>}
                    {content.body && <section className="microBlock"><span className="microLabel">Learn it simply</span><p>{content.body}</p></section>}

                    {content.keyTerms?.length ? <section className="microBlock"><span className="microLabel">Key words</span><div className="termGrid">{content.keyTerms.map((item) => <div className="termCard" key={item.term}><strong>{item.term}</strong><span>{item.meaning}</span></div>)}</div></section> : null}

                    {content.scenario && <div className="scenarioBox"><strong>Business scenario</strong><p>{content.scenario}</p></div>}
                    {content.commonMistake && <div className="mistakeBox"><strong>Common beginner mistake</strong><p>{content.commonMistake}</p></div>}
                    {content.quickCheck && <div className="quickCheck"><strong>Think before you click</strong><p>{content.quickCheck}</p></div>}
                    {remember && <div className="rememberStrip"><strong>Remember:</strong><span>{remember}</span></div>}

                    <div className="practiceDivider"><span>Now do it yourself</span></div>
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
