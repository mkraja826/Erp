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

function tokenFrom(request:Request){const auth=request.headers.get("authorization");return auth?.startsWith("Bearer ")?auth.slice(7):undefined;}
function average(values:number[]){return values.length?Math.round(values.reduce((a,b)=>a+b,0)/values.length):0;}
function independence(rows:Array<{ai_help_count:number}>){if(!rows.length)return 100;return Math.max(0,Math.round(100-(rows.reduce((s,r)=>s+r.ai_help_count,0)/rows.length)*20));}
function level(score:number,jobReady:boolean){if(jobReady)return "Job Ready — SAP MM Level 1";return score>=90?"Advanced Beginner":score>=65?"Developing":"Beginner";}

export async function GET(request:Request){
 const token=tokenFrom(request);if(!token)return NextResponse.json({error:"Authentication required"},{status:401});
 const user=await getSupabaseUser(token);if(!user)return NextResponse.json({error:"Invalid session"},{status:401});
 const courses=await supabaseRest<Course[]>("courses?slug=eq.sap-mm-level-1&select=id,title,slug,module_code&limit=1",{},token);const course=courses[0];if(!course)return NextResponse.json({error:"Course not found"},{status:404});
 const readinessRows=await supabaseRest<AssessmentRef[]>(`job_readiness_assessments?slug=eq.sap-mm-level-1-job-readiness&course_id=eq.${course.id}&is_published=eq.true&select=id,course_id&limit=1`,{},token);const readiness=readinessRows[0];
 const enrollments=await supabaseRest<Enrollment[]>(`enrollments?user_id=eq.${user.id}&course_id=eq.${course.id}&select=status,progress_percent&limit=1`,{},token);const enrollment=enrollments[0];
 const work=await supabaseRest<Attempt[]>(`work_lab_attempts?user_id=eq.${user.id}&select=score,result,ai_help_count`,{},token);
 const incidents=await supabaseRest<IncidentAttempt[]>(`work_lab_incident_attempts?user_id=eq.${user.id}&select=score,result,ai_help_count`,{},token);
 const assessments=readiness?await supabaseRest<AssessmentAttempt[]>(`job_readiness_attempts?user_id=eq.${user.id}&assessment_id=eq.${readiness.id}&select=score,status,ai_help_count,submitted_at&order=score.desc`,{},token):[];
 const profiles=await supabaseRest<Profile[]>(`profiles?id=eq.${user.id}&select=id,full_name,public_profile_slug&limit=1`,{},token);let profile=profiles[0];
 const courseScore=Math.round(Number(enrollment?.progress_percent??0));
 const practicalScore=average(work.map(x=>x.score));
 const incidentScore=average(incidents.map(x=>x.score));
 const independenceScore=independence([...work,...incidents]);
 const bestAssessment=assessments[0]??null;
 const jobReady=assessments.some(a=>a.status==="passed"&&a.score>=80&&a.ai_help_count<=1);
 const overall=Math.round(courseScore*.30+practicalScore*.25+incidentScore*.15+independenceScore*.10+(bestAssessment?.score??0)*.20);
 const currentLevel=level(overall,jobReady);
 const eligible=courseScore===100&&work.some(x=>x.result==="pass")&&incidents.some(x=>x.result==="pass");
 if(!profile?.public_profile_slug){const slug=`learner-${user.id.slice(0,8)}`;await supabaseRest(`profiles?id=eq.${user.id}`,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({public_profile_slug:slug})},token);profile={...(profile??{id:user.id,full_name:null,public_profile_slug:null}),public_profile_slug:slug};}
 if(eligible){const existing=await supabaseRest<Certificate[]>(`certificates?user_id=eq.${user.id}&course_id=eq.${course.id}&certificate_type=eq.practical_competency&select=id,certificate_type,verification_code,score,issued_at,metadata,is_public&limit=1`,{},token);if(!existing[0]){const code=`ERP-${course.module_code}-${Date.now().toString(36).toUpperCase()}-${user.id.slice(0,4).toUpperCase()}`;await supabaseRest("certificates",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({user_id:user.id,course_id:course.id,certificate_type:"practical_competency",verification_code:code,score:overall,metadata:{courseScore,practicalScore,incidentScore,independenceScore,assessmentScore:bestAssessment?.score??0,jobReady,level:currentLevel},is_public:true})},token);}}
 if(jobReady){const existing=await supabaseRest<Certificate[]>(`certificates?user_id=eq.${user.id}&course_id=eq.${course.id}&certificate_type=eq.job_readiness&select=id&limit=1`,{},token);if(!existing[0]){const code=`ERP-JR-${course.module_code}-${Date.now().toString(36).toUpperCase()}-${user.id.slice(0,4).toUpperCase()}`;await supabaseRest("certificates",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({user_id:user.id,course_id:course.id,certificate_type:"job_readiness",verification_code:code,score:bestAssessment?.score??overall,metadata:{assessmentScore:bestAssessment?.score??0,assessmentAiHelp:bestAssessment?.ai_help_count??0,jobReady:true,level:"Job Ready — SAP MM Level 1"},is_public:true})},token);}}
 const certificates=await supabaseRest<Certificate[]>(`certificates?user_id=eq.${user.id}&course_id=eq.${course.id}&select=id,certificate_type,verification_code,score,issued_at,metadata,is_public&order=issued_at.desc`,{},token);const publicCertificate=certificates.find(c=>c.certificate_type==="job_readiness"&&c.is_public)??certificates.find(c=>c.is_public);
 if(publicCertificate&&profile?.public_profile_slug){await supabaseRest("public_skill_snapshots?on_conflict=profile_slug",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({user_id:user.id,profile_slug:profile.public_profile_slug,display_name:profile.full_name||"ERP Edu Learner",course_title:course.title,module_code:course.module_code,verification_code:publicCertificate.verification_code,certificate_type:publicCertificate.certificate_type,score:publicCertificate.score,issued_at:publicCertificate.issued_at,skills:{...publicCertificate.metadata,courseScore,practicalScore,incidentScore,independenceScore,assessmentScore:bestAssessment?.score??0,jobReady,level:currentLevel},updated_at:new Date().toISOString()})},token);}
 return NextResponse.json({learner:{email:user.email??null,fullName:profile?.full_name??null,slug:profile?.public_profile_slug},course,eligible,jobReady,skills:{courseScore,practicalScore,incidentScore,independenceScore,assessmentScore:bestAssessment?.score??0,overall,level:currentLevel},evidence:{workAttempts:work.length,workPassed:work.filter(x=>x.result==="pass").length,incidentAttempts:incidents.length,incidentsResolved:incidents.filter(x=>x.result==="pass").length,assessmentAttempts:assessments.length,assessmentPassed:jobReady},certificates});
}
