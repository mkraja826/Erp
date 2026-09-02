import { NextResponse } from "next/server";
import { getSupabaseUser, supabaseRest } from "../../../lib/supabase";

type Enrollment={status:string;progress_percent:number};
type Attempt={score:number;result:string;ai_help_count:number};
type IncidentAttempt={score:number;result:string;ai_help_count:number};
type AssessmentAttempt={score:number;status:string;ai_help_count:number;submitted_at:string|null};
type AssessmentRef={id:string;course_id:string};
type Profile={id:string;full_name:string|null;public_profile_slug:string|null};
type Course={id:string;title:string;slug:string;module_code:string};
type Certificate={id:string;certificate_type:string;verification_code:string;score:number;issued_at:string;metadata:Record<string,unknown>;is_public:boolean};
type TrainingDoc={id:string;status:string;header:Record<string,unknown>;created_at:string};
type CompetencyDoc={id:string;document_number:string};

function tokenFrom(request:Request){const auth=request.headers.get("authorization");return auth?.startsWith("Bearer ")?auth.slice(7):undefined;}
function average(values:number[]){return values.length?Math.round(values.reduce((a,b)=>a+b,0)/values.length):0;}
function helpIndependence(rows:Array<{ai_help_count:number}>){if(!rows.length)return 100;return Math.max(0,Math.round(100-(rows.reduce((s,r)=>s+r.ai_help_count,0)/rows.length)*20));}
function level(score:number,jobReady:boolean){if(jobReady)return "Job Ready — SAP MM Level 1";return score>=90?"Workplace Ready":score>=75?"Applied":score>=60?"Developing":"Beginner";}
function num(header:Record<string,unknown>,key:string){const n=Number(header[key]??0);return Number.isFinite(n)?n:0;}

export async function GET(request:Request){
 const token=tokenFrom(request);if(!token)return NextResponse.json({error:"Authentication required"},{status:401});
 const user=await getSupabaseUser(token);if(!user)return NextResponse.json({error:"Invalid session"},{status:401});
 const courses=await supabaseRest<Course[]>("courses?slug=eq.sap-mm-level-1&select=id,title,slug,module_code&limit=1",{},token);const course=courses[0];if(!course)return NextResponse.json({error:"Course not found"},{status:404});
 const readinessRows=await supabaseRest<AssessmentRef[]>(`job_readiness_assessments?slug=eq.sap-mm-level-1-job-readiness&course_id=eq.${course.id}&is_published=eq.true&select=id,course_id&limit=1`,{},token);const readiness=readinessRows[0];
 const [enrollments,work,incidents,training,profiles]=await Promise.all([
  supabaseRest<Enrollment[]>(`enrollments?user_id=eq.${user.id}&course_id=eq.${course.id}&select=status,progress_percent&limit=1`,{},token),
  supabaseRest<Attempt[]>(`work_lab_attempts?user_id=eq.${user.id}&select=score,result,ai_help_count`,{},token),
  supabaseRest<IncidentAttempt[]>(`work_lab_incident_attempts?user_id=eq.${user.id}&select=score,result,ai_help_count`,{},token),
  supabaseRest<TrainingDoc[]>(`erp_documents?user_id=eq.${user.id}&document_type=eq.TRAINING_SESSION&status=eq.completed&select=id,status,header,created_at&order=created_at.desc`,{},token),
  supabaseRest<Profile[]>(`profiles?id=eq.${user.id}&select=id,full_name,public_profile_slug&limit=1`,{},token),
 ]);
 const assessments=readiness?await supabaseRest<AssessmentAttempt[]>(`job_readiness_attempts?user_id=eq.${user.id}&assessment_id=eq.${readiness.id}&select=score,status,ai_help_count,submitted_at&order=score.desc`,{},token):[];
 let profile=profiles[0];const enrollment=enrollments[0];
 const courseScore=Math.round(Number(enrollment?.progress_percent??0));
 const practicalScore=average(work.map(x=>x.score));
 const incidentScore=average(incidents.map(x=>x.score));
 const workIndependence=helpIndependence([...work,...incidents]);
 const sessionIndependence=training.length?average(training.map(x=>num(x.header,"independence_score"))):workIndependence;
 const transactionAccuracy=training.length?average(training.map(x=>Math.max(0,Math.min(100,100-num(x.header,"mistakes")*10+Math.min(num(x.header,"mistakes"),num(x.header,"corrections"))*3)))):practicalScore;
 const bestAssessment=assessments[0]??null;
 const jobReady=assessments.some(a=>a.status==="passed"&&a.score>=80&&a.ai_help_count<=1);
 const overall=Math.round(courseScore*.20+transactionAccuracy*.20+sessionIndependence*.20+practicalScore*.15+incidentScore*.10+(bestAssessment?.score??0)*.15);
 const currentLevel=level(overall,jobReady);
 const eligible=courseScore===100&&work.some(x=>x.result==="pass")&&incidents.some(x=>x.result==="pass");
 const readinessBand=jobReady?"certified":overall>=90&&training.length>0?"workplace_ready":overall>=75?"applied":overall>=60?"developing":"foundation";
 const evidence={trainingSessions:training.length,workAttempts:work.length,workPassed:work.filter(x=>x.result==="pass").length,incidentAttempts:incidents.length,incidentsResolved:incidents.filter(x=>x.result==="pass").length,assessmentAttempts:assessments.length,assessmentPassed:jobReady};
 const skills={courseScore,transactionAccuracy,trainingIndependence:sessionIndependence,practicalScore,incidentScore,assessmentScore:bestAssessment?.score??0,overall,level:currentLevel,readinessBand};

 if(!profile?.public_profile_slug){const slug=`learner-${user.id.slice(0,8)}`;await supabaseRest(`profiles?id=eq.${user.id}`,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({public_profile_slug:slug})},token);profile={...(profile??{id:user.id,full_name:null,public_profile_slug:null}),public_profile_slug:slug};}

 const competencyNumber=`CMP-${course.module_code}-${user.id.slice(0,8).toUpperCase()}`;
 const existingProfile=await supabaseRest<CompetencyDoc[]>(`erp_documents?user_id=eq.${user.id}&document_type=eq.COMPETENCY_PROFILE&document_number=eq.${encodeURIComponent(competencyNumber)}&select=id,document_number&limit=1`,{},token);
 const competencyPayload={status:jobReady?"job_ready":"active",header:{course_id:course.id,course_slug:course.slug,module_code:course.module_code,...skills,evidence,updated_at:new Date().toISOString(),training_phase:"6C"},items:[{skill_key:"transaction_accuracy",score:transactionAccuracy},{skill_key:"training_independence",score:sessionIndependence},{skill_key:"practical_execution",score:practicalScore},{skill_key:"incident_investigation",score:incidentScore},{skill_key:"job_readiness",score:bestAssessment?.score??0}]};
 if(existingProfile[0])await supabaseRest(`erp_documents?id=eq.${existingProfile[0].id}&user_id=eq.${user.id}`,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify(competencyPayload)},token);
 else await supabaseRest("erp_documents",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({user_id:user.id,document_type:"COMPETENCY_PROFILE",document_number:competencyNumber,...competencyPayload})},token);

 if(eligible){const existing=await supabaseRest<Certificate[]>(`certificates?user_id=eq.${user.id}&course_id=eq.${course.id}&certificate_type=eq.practical_competency&select=id,certificate_type,verification_code,score,issued_at,metadata,is_public&limit=1`,{},token);if(!existing[0]){const code=`ERP-${course.module_code}-${Date.now().toString(36).toUpperCase()}-${user.id.slice(0,4).toUpperCase()}`;await supabaseRest("certificates",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({user_id:user.id,course_id:course.id,certificate_type:"practical_competency",verification_code:code,score:overall,metadata:{...skills,jobReady},is_public:true})},token);}}
 if(jobReady){const existing=await supabaseRest<Certificate[]>(`certificates?user_id=eq.${user.id}&course_id=eq.${course.id}&certificate_type=eq.job_readiness&select=id&limit=1`,{},token);if(!existing[0]){const code=`ERP-JR-${course.module_code}-${Date.now().toString(36).toUpperCase()}-${user.id.slice(0,4).toUpperCase()}`;await supabaseRest("certificates",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({user_id:user.id,course_id:course.id,certificate_type:"job_readiness",verification_code:code,score:bestAssessment?.score??overall,metadata:{...skills,jobReady:true},is_public:true})},token);}}
 const certificates=await supabaseRest<Certificate[]>(`certificates?user_id=eq.${user.id}&course_id=eq.${course.id}&select=id,certificate_type,verification_code,score,issued_at,metadata,is_public&order=issued_at.desc`,{},token);const publicCertificate=certificates.find(c=>c.certificate_type==="job_readiness"&&c.is_public)??certificates.find(c=>c.is_public);
 if(publicCertificate&&profile?.public_profile_slug){await supabaseRest("public_skill_snapshots?on_conflict=profile_slug",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({user_id:user.id,profile_slug:profile.public_profile_slug,display_name:profile.full_name||"ERP Edu Learner",course_title:course.title,module_code:course.module_code,verification_code:publicCertificate.verification_code,certificate_type:publicCertificate.certificate_type,score:publicCertificate.score,issued_at:publicCertificate.issued_at,skills:{...skills,jobReady},updated_at:new Date().toISOString()})},token);}
 return NextResponse.json({learner:{email:user.email??null,fullName:profile?.full_name??null,slug:profile?.public_profile_slug},course,eligible,jobReady,competencyProfile:{documentNumber:competencyNumber,status:jobReady?"job_ready":"active"},skills,evidence,certificates});
}
