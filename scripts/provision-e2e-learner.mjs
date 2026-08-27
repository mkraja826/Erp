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

function workLabEmail(base) {
  const at = base.lastIndexOf('@');
  return at > 0 ? `${base.slice(0, at)}+worklab${base.slice(at)}` : `${base}+worklab`;
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
  return created.id;
}

await ensureUser(email, 'ERP Edu E2E Learner', 'ci-e2e');
console.log('E2E learner refreshed and confirmed.');

const completedEmail = workLabEmail(email);
const completedUserId = await ensureUser(completedEmail, 'ERP Edu E2E Work Lab Learner', 'ci-e2e-work-lab');
const courses = await restRequest('courses?slug=eq.sap-mm-level-1&select=id&limit=1');
const courseId = courses?.[0]?.id;
if (!courseId) throw new Error('SAP MM Level 1 course was not found while provisioning Work Lab learner.');

await restRequest('enrollments?on_conflict=user_id,course_id', {
  method: 'POST',
  headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
  body: JSON.stringify({
    user_id: completedUserId,
    course_id: courseId,
    status: 'completed',
    progress_percent: 100,
    completed_at: new Date().toISOString(),
  }),
});
console.log('Work Lab E2E learner refreshed, confirmed, and marked course-complete.');
