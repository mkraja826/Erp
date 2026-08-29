const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.E2E_LEARNER_EMAIL;
const password = process.env.E2E_LEARNER_PASSWORD;

if (!url || !serviceRoleKey || !email || !password) {
  const message = 'Required authenticated E2E secrets are not configured: SUPABASE_SERVICE_ROLE_KEY, E2E_LEARNER_EMAIL, and E2E_LEARNER_PASSWORD are required.';
  if (process.env.CI) {
    console.error(message);
    process.exit(1);
  }
  console.log(`${message} Skipping local provisioning.`);
  process.exit(0);
}

const headers = {
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
  'Content-Type': 'application/json',
};

async function authRequest(path, init = {}) {
  const response = await fetch(`${url}/auth/v1/${path}`, {
    ...init,
    headers: { ...headers, ...(init.headers ?? {}) },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(`Supabase Auth request failed (${response.status}): ${text}`);
  return body;
}

async function restRequest(path, init = {}) {
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: { ...headers, ...(init.headers ?? {}) },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(`Supabase REST request failed (${response.status}): ${text}`);
  return body;
}

function taggedEmail(base, tag) {
  const at = base.lastIndexOf('@');
  return at > 0 ? `${base.slice(0, at)}+${tag}${base.slice(at)}` : `${base}+${tag}`;
}

function workLabEmail(base) {
  return taggedEmail(base, 'worklab');
}

const usersPage = await authRequest('admin/users?page=1&per_page=1000');
const users = Array.isArray(usersPage?.users) ? usersPage.users : [];

async function ensureUser(targetEmail, fullName, purpose) {
  const existing = users.find((user) => user.email?.toLowerCase() === targetEmail.toLowerCase());
  const attributes = {
    email: targetEmail,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, purpose },
  };
  if (existing?.id) {
    await authRequest(`admin/users/${existing.id}`, { method: 'PUT', body: JSON.stringify(attributes) });
    return existing.id;
  }
  const created = await authRequest('admin/users', { method: 'POST', body: JSON.stringify(attributes) });
  users.push(created);
  return created.id;
}

async function loadCourse(slug) {
  const courses = await restRequest(`courses?slug=eq.${slug}&select=id&limit=1`);
  const courseId = courses?.[0]?.id;
  if (!courseId) throw new Error(`${slug} course was not found while provisioning E2E learners.`);
  const modules = await restRequest(`course_modules?course_id=eq.${courseId}&select=id&order=position.asc`);
  const moduleIds = (modules ?? []).map((row) => row.id);
  if (!moduleIds.length) throw new Error(`${slug} modules were not found while provisioning E2E learners.`);
  const lessons = await restRequest(`lessons?module_id=in.(${moduleIds.join(',')})&select=id&order=position.asc`);
  if (!Array.isArray(lessons) || lessons.length === 0) throw new Error(`${slug} lessons were not found while provisioning E2E learners.`);
  return { courseId, lessons };
}

async function resetLearnerLearning(userId) {
  await restRequest(`exercise_attempts?user_id=eq.${userId}`, { method: 'DELETE' });
  await restRequest(`lesson_progress?user_id=eq.${userId}`, { method: 'DELETE' });
  await restRequest(`enrollments?user_id=eq.${userId}`, { method: 'DELETE' });
}

async function resetLearnerErpState(userId) {
  await restRequest(`erp_documents?user_id=eq.${userId}`, { method: 'DELETE' });
  await restRequest(`erp_inventory_balances?user_id=eq.${userId}`, { method: 'DELETE' });
}

async function seedCourseComplete(userId, courseId, lessons, completedAt) {
  await restRequest('lesson_progress?on_conflict=user_id,lesson_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(lessons.map((lesson) => ({
      user_id: userId,
      lesson_id: lesson.id,
      status: 'completed',
      attempts: 1,
      completed_at: completedAt,
      updated_at: completedAt,
    }))),
  });
  await restRequest('enrollments?on_conflict=user_id,course_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      user_id: userId,
      course_id: courseId,
      status: 'completed',
      progress_percent: 100,
      completed_at: completedAt,
    }),
  });
}

const learnerUserId = await ensureUser(email, 'ERP Edu E2E Learner', 'ci-e2e');
await resetLearnerLearning(learnerUserId);
await resetLearnerErpState(learnerUserId);
console.log('E2E learner refreshed, confirmed, and reset to clean learning + ERP simulator state.');

const foundation = await loadCourse('sap-foundations');
const mm = await loadCourse('sap-mm-level-1');

const completedEmail = workLabEmail(email);
const completedUserId = await ensureUser(completedEmail, 'ERP Edu E2E Work Lab Learner', 'ci-e2e-work-lab');
const completedAt = new Date().toISOString();
await seedCourseComplete(completedUserId, foundation.courseId, foundation.lessons, completedAt);
await seedCourseComplete(completedUserId, mm.courseId, mm.lessons, completedAt);

const allCompletedLessons = [...foundation.lessons, ...mm.lessons];
const verifiedProgress = await restRequest(`lesson_progress?user_id=eq.${completedUserId}&status=eq.completed&lesson_id=in.(${allCompletedLessons.map((lesson) => lesson.id).join(',')})&select=lesson_id`);
const verifiedEnrollments = await restRequest(`enrollments?user_id=eq.${completedUserId}&course_id=in.(${foundation.courseId},${mm.courseId})&select=course_id,status,progress_percent`);
const validEnrollments = (verifiedEnrollments ?? []).filter((row) => row.status === 'completed' && Number(row.progress_percent) === 100);
if (verifiedProgress?.length !== allCompletedLessons.length || validEnrollments.length !== 2) {
  throw new Error(`Work Lab learner completion seed verification failed: ${JSON.stringify({ completedLessons: verifiedProgress?.length, totalLessons: allCompletedLessons.length, enrollments: verifiedEnrollments })}`);
}
console.log(`Work Lab E2E learner refreshed and seeded with Foundations + SAP MM completion (${allCompletedLessons.length} lessons).`);

const isolationAEmail = taggedEmail(email, 'isolation-a');
const isolationBEmail = taggedEmail(email, 'isolation-b');
await ensureUser(isolationAEmail, 'ERP Edu Isolation Learner A', 'ci-e2e-isolation-a');
const isolationBUserId = await ensureUser(isolationBEmail, 'ERP Edu Isolation Learner B', 'ci-e2e-isolation-b');

await restRequest('enrollments?on_conflict=user_id,course_id', {
  method: 'POST',
  headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
  body: JSON.stringify({
    user_id: isolationBUserId,
    course_id: mm.courseId,
    status: 'active',
    progress_percent: 42,
    completed_at: null,
  }),
});

const isolationEnrollment = await restRequest(`enrollments?user_id=eq.${isolationBUserId}&course_id=eq.${mm.courseId}&select=user_id,status,progress_percent&limit=1`);
if (isolationEnrollment?.[0]?.user_id !== isolationBUserId || Number(isolationEnrollment?.[0]?.progress_percent) !== 42) {
  throw new Error(`Isolation learner seed verification failed: ${JSON.stringify(isolationEnrollment)}`);
}

console.log('Cross-user isolation learners refreshed and private marker enrollment seeded.');
