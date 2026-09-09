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
  let foundationPrerequisiteLessonId: string | undefined;
  if (slug === "sap-mm-level-1") {
    const foundation = await getPublishedCourse("sap-foundations");
    foundationPrerequisiteLessonId = foundation?.course_modules.flatMap((module) => module.lessons).at(-1)?.id;
  }
  const isFoundation = slug === "sap-foundations";

  return <main className="coursePage">
    <header className="courseTopbar"><Link href="/" className="brandLink">ERP Edu</Link><div className="courseTopActions"><span className="courseBadge">{course.module_code} · {course.difficulty}</span><Link href="/dashboard" className="secondaryButton">Dashboard</Link></div></header>
    <section className="courseHero"><div><span className="eyebrow">{isFoundation ? "Course 1 · Start here" : "Course 2 · SAP MM"}</span><h1>{course.title}</h1><p>{course.description}</p></div><div className="courseStats"><div><strong>{course.course_modules.length}</strong><span>Modules</span></div><div><strong>{lessons.length}</strong><span>Lessons</span></div><div><strong>{totalMinutes}</strong><span>Minutes</span></div></div></section>
    <section className="learningRule"><strong>Learn by doing</strong><span>Learn → See → Do → Check</span></section>
    <div className="courseContent">{course.course_modules.map((module)=><section className="courseModule" key={module.id}>
      <div className="moduleHeading"><span className="moduleNumber">{String(module.position).padStart(2,"0")}</span><div><span className="moduleEyebrow">Module {module.position}</span><h2>{module.title}</h2>{module.description&&<p>{module.description}</p>}</div></div>
      {module.lessons.map((lesson)=>{const content=lesson.content as LessonContent;const lessonIndex=lessons.findIndex((item)=>item.id===lesson.id);const previousLessonId=lessonIndex>0?lessons[lessonIndex-1].id:foundationPrerequisiteLessonId;const prerequisiteLabel=lessonIndex===0&&foundationPrerequisiteLessonId?"SAP Foundations":undefined;const learnText=content.body??content.whyItMatters??lesson.summary??content.goal;const takeaway=content.remember??content.goal;return <LessonGate key={lesson.id} lessonId={lesson.id} previousLessonId={previousLessonId} prerequisiteLabel={prerequisiteLabel}>
        <article className="lessonCard lessonFlow">
          <div className="lessonMeta"><span>{lesson.lesson_type}</span><span>{lesson.estimated_minutes} min</span><span>Lesson {lessonIndex+1} of {lessons.length}</span></div><h3>{lesson.title}</h3>
          <section className="learningStage"><span className="stageNumber">1</span><div><span className="microLabel">Learn</span>{learnText&&<p>{learnText}</p>}{content.keyTerms?.length?<div className="termGrid compactTerms">{content.keyTerms.map((item)=><div className="termCard" key={item.term}><strong>{item.term}</strong><span>{item.meaning}</span></div>)}</div>:null}</div></section>
          {content.scenario&&<section className="learningStage"><span className="stageNumber">2</span><div><span className="microLabel">See</span><p>{content.scenario}</p></div></section>}
          <section className="learningStage actionStage"><span className="stageNumber">3</span><div><span className="microLabel">Do</span><p>{content.quickCheck??"Use what you just learned. Decide what you would do in the ERP process."}</p>{content.commonMistake&&<details className="mistakeDisclosure"><summary>Watch for a common mistake</summary><p>{content.commonMistake}</p></details>}</div></section>
          <section className="checkStage"><div className="checkStageHeader"><span className="stageNumber">4</span><div><span className="microLabel">Check</span><strong>Prove you understand it</strong></div></div>{lesson.exercises.map((exercise)=><ExerciseCard key={exercise.id} exercise={exercise}/>)}</section>
          {takeaway&&<div className="takeawayStrip"><strong>Key takeaway</strong><span>{takeaway}</span></div>}
        </article>
      </LessonGate>;})}
    </section>)}</div>
    {isFoundation?<section className="workLabTeaser"><span className="eyebrow">Next course</span><h2>SAP MM Level 1</h2><p>After Foundations, continue into Materials Management, procurement, inventory, and invoice verification.</p><Link className="primaryButton" href="/courses/sap-mm-level-1">Go to SAP MM Level 1</Link></section>:<section className="workLabTeaser"><span className="eyebrow">After course completion</span><h2>Your Work Lab unlocks next</h2><p>Guidance reduces gradually as you move from learning into realistic junior SAP MM work.</p></section>}
  </main>;
}
