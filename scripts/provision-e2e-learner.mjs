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

await ensureUser(email, 'ERP Edu E2E Learner', 'ci-e2e');
console.log('E2E learner refreshed and confirmed.');

const completedEmail = workLabEmail(email);
const completedUserId = await ensureUser(completedEmail, 'ERP Edu E2E Work Lab Learner', 'ci-e2e-work-lab');
const courses = await restRequest('courses?slug=eq.sap-mm-level-1&select=id&limit=1');
const courseId = courses?.[0]?.id;
if (!courseId) throw new Error('SAP MM Level 1 course was not found while provisioning Work Lab learner.');

const modules = await restRequest(`course_modules?course_id=eq.${courseId}&select=id`);
const moduleIds = (modules ?? []).map((row) => row.id);
if (!moduleIds.length) throw new Error('SAP MM Level 1 modules were not found while provisioning Work Lab learner.');

const lessons = await restRequest(`lessons?module_id=in.(${moduleIds.join(',')})&select=id`);
if (!Array.isArray(lessons) || lessons.length === 0) throw new Error('SAP MM Level 1 lessons were not found while provisioning Work Lab learner.');

const completedAt = new Date().toISOString();
await restRequest('lesson_progress?on_conflict=user_id,lesson_id', {
  method: 'POST',
  headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
  body: JSON.stringify(lessons.map((lesson) => ({
    user_id: completedUserId,
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
    user_id: completedUserId,
    course_id: courseId,
    status: 'completed',
    progress_percent: 100,
    completed_at: completedAt,
  }),
});

const verifiedProgress = await restRequest(`lesson_progress?user_id=eq.${completedUserId}&status=eq.completed&lesson_id=in.(${lessons.map((lesson) => lesson.id).join(',')})&select=lesson_id`);
const verifiedEnrollment = await restRequest(`enrollments?user_id=eq.${completedUserId}&course_id=eq.${courseId}&select=status,progress_percent&limit=1`);
const enrollment = verifiedEnrollment?.[0];
if (verifiedProgress?.length !== lessons.length || enrollment?.status !== 'completed' || Number(enrollment?.progress_percent) !== 100) {
  throw new Error(`Work Lab learner completion seed verification failed: ${JSON.stringify({ completedLessons: verifiedProgress?.length, totalLessons: lessons.length, enrollment })}`);
}

console.log(`Work Lab E2E learner refreshed, confirmed, and seeded with ${lessons.length}/${lessons.length} completed lessons.`);

const isolationAEmail = taggedEmail(email, 'isolation-a');
const isolationBEmail = taggedEmail(email, 'isolation-b');
await ensureUser(isolationAEmail, 'ERP Edu Isolation Learner A', 'ci-e2e-isolation-a');
const isolationBUserId = await ensureUser(isolationBEmail, 'ERP Edu Isolation Learner B', 'ci-e2e-isolation-b');

await restRequest('enrollments?on_conflict=user_id,course_id', {
  method: 'POST',
  headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
  body: JSON.stringify({
    user_id: isolationBUserId,
    course_id: courseId,
    status: 'active',
    progress_percent: 42,
    completed_at: null,
  }),
});

const isolationEnrollment = await restRequest(`enrollments?user_id=eq.${isolationBUserId}&course_id=eq.${courseId}&select=user_id,status,progress_percent&limit=1`);
if (isolationEnrollment?.[0]?.user_id !== isolationBUserId || Number(isolationEnrollment?.[0]?.progress_percent) !== 42) {
  throw new Error(`Isolation learner seed verification failed: ${JSON.stringify(isolationEnrollment)}`);
}

console.log('Cross-user isolation learners refreshed and private marker enrollment seeded.');
