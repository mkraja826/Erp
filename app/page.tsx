import Link from "next/link";
import { ArrowRight, BookOpen, Bot, BriefcaseBusiness, CheckCircle2, Gauge, GraduationCap, PlayCircle, Sparkles, Trophy } from "lucide-react";

const stages = [
  { icon: BookOpen, title: "Learn simply", text: "Short lessons explain SAP in plain language with business examples." },
  { icon: PlayCircle, title: "Practice safely", text: "Perform guided SAP-style tasks without worrying about breaking anything." },
  { icon: CheckCircle2, title: "Get verified", text: "The verifier checks what you actually did, not whether you clicked Complete." },
  { icon: BriefcaseBusiness, title: "Work like a professional", text: "After qualification, solve realistic tickets and business scenarios." },
];

const modules = [
  { name: "SAP Foundations", subtitle: "ERP & SAP basics", progress: 0, status: "Start here" },
  { name: "SAP MM", subtitle: "Materials Management", progress: 0, status: "After Foundations" },
  { name: "SAP FICO", subtitle: "Finance & Controlling", progress: 0, status: "Coming next" },
];

export default function HomePage() {
  return (
    <main>
      <header className="topbar shell">
        <div className="brand"><span className="brandMark">E</span><span>ERP Edu</span></div>
        <nav className="nav" aria-label="Primary navigation">
          <a href="#learn">Learn</a><a href="#practice">Practice</a><a href="#work">Work Lab</a>
        </nav>
        <Link className="ghostButton" href="/auth">Sign in</Link>
      </header>

      <section className="hero shell">
        <div className="heroCopy">
          <div className="eyebrow"><Sparkles size={16} /> SAP learning built for real people</div>
          <h1>Learn SAP. Practice it. <span>Prove you can do the work.</span></h1>
          <p>ERP Edu starts with SAP Foundations, then takes you into SAP MM through a guided, hands-on journey. AI helps when you are stuck, practice is verified automatically, and course graduates enter a realistic work simulation.</p>
          <div className="heroActions">
            <Link className="primaryButton" href="/courses/sap-foundations">Start SAP Foundations <ArrowRight size={18} /></Link>
            <a className="secondaryButton" href="#learn">Explore learning path</a>
          </div>
          <div className="trustRow">
            <span><CheckCircle2 size={16}/> Beginner friendly</span>
            <span><CheckCircle2 size={16}/> AI-guided</span>
            <span><CheckCircle2 size={16}/> Skill verified</span>
          </div>
        </div>

        <aside className="coachCard" aria-label="AI coach preview">
          <div className="coachHeader"><div className="coachIcon"><Bot size={22}/></div><div><strong>AI Learning Coach</strong><small>Always available</small></div><span className="onlineDot" /></div>
          <div className="message aiMessage">New to SAP? Start with the basics: what ERP is, what SAP does, and how business processes connect.</div>
          <div className="message learnerMessage">Yes, start from the beginning.</div>
          <div className="message aiMessage">Perfect. SAP Foundations comes first. After that, SAP MM teaches how companies request, buy, receive, and verify materials.</div>
          <Link className="hintButton" href="/courses/sap-foundations">Start Foundations <ArrowRight size={16}/></Link>
        </aside>
      </section>

      <section id="learn" className="section shell">
        <div className="sectionHeading"><div><span className="kicker">THE LEARNING LOOP</span><h2>Never stuck. Never just watching.</h2></div><p>Every lesson quickly moves from understanding into doing, with help that adapts to the learner.</p></div>
        <div className="stageGrid">{stages.map(({icon: Icon,title,text}, i)=><article className="stageCard" key={title}><span className="stepNo">0{i+1}</span><Icon size={24}/><h3>{title}</h3><p>{text}</p></article>)}</div>
      </section>

      <section id="practice" className="section shell splitSection">
        <div>
          <span className="kicker">FIRST LEARNING TRACK</span>
          <h2>Start with SAP Foundations. Then learn SAP MM.</h2>
          <p className="muted">Complete the basics first, then move into the Materials Management path and realistic procurement practice.</p>
          <div className="moduleList">{modules.map((module)=><div className="moduleRow" key={module.name}><div><strong>{module.name}</strong><span>{module.subtitle}</span></div><div className="progressArea"><div className="progressTrack"><div className="progressFill" style={{width:`${module.progress}%`}} /></div><small>{module.status}</small></div></div>)}</div>
        </div>
        <div className="verificationCard">
          <div className="cardTitle"><Gauge size={20}/><strong>Practice Verifier</strong></div>
          <p className="muted">Later in SAP MM: Create a purchase order for the Hyderabad plant.</p>
          <div className="checkList">
            <div><span>Vendor</span><strong className="pass">✓ Correct</strong></div>
            <div><span>Material</span><strong className="pass">✓ Correct</strong></div>
            <div><span>Quantity</span><strong className="warn">Needs review</strong></div>
            <div><span>Plant</span><strong className="pass">✓ Correct</strong></div>
          </div>
          <div className="coachNote"><Bot size={18}/><p>Your quantity is close. Re-read the request: the warehouse needs <strong>500 units</strong>. Try changing only that field.</p></div>
          <Link className="primaryButton full" href="/courses/sap-foundations">Begin the learning path</Link>
        </div>
      </section>

      <section id="work" className="workSection">
        <div className="shell workGrid">
          <div><span className="kicker light">AFTER COURSE COMPLETION</span><h2>Your course ends. Your work environment begins.</h2><p>Graduates move into a simulated SAP workplace with tickets, deadlines, business problems and progressively harder cases. AI remains available as a work assistant, but independent problem-solving becomes part of the score.</p><div className="workStats"><div><strong>24</strong><span>Verified scenarios</span></div><div><strong>91%</strong><span>Accuracy</span></div><div><strong>Low</strong><span>AI dependency</span></div></div></div>
          <div className="ticketCard"><div className="ticketTop"><span className="priority">HIGH PRIORITY</span><span>#MM-1042</span></div><h3>Invoice blocked after goods receipt</h3><p>A vendor invoice is blocked due to a quantity variance. Investigate the procurement documents and resolve the issue correctly.</p><div className="ticketMeta"><span>Procurement</span><span>Intermediate</span><span>25 min target</span></div><button className="lightButton">Open work ticket <ArrowRight size={16}/></button></div>
        </div>
      </section>

      <section className="section shell certificateSection">
        <div className="certificateIcon"><GraduationCap size={30}/></div>
        <div><span className="kicker">PROVE THE SKILL</span><h2>Certification backed by performance.</h2><p className="muted">Certificates can represent verified exercises, projects, work-simulation performance and independence—not only course completion.</p></div>
        <div className="scoreBadge"><Trophy size={22}/><div><strong>Verified Skill</strong><span>SAP MM · Level 3</span></div></div>
      </section>

      <footer className="footer shell"><div className="brand"><span className="brandMark">E</span><span>ERP Edu</span></div><p>Learn → Practice → Verify → Work.</p></footer>
    </main>
  );
}
