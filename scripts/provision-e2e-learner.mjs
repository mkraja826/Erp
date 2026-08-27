const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.E2E_LEARNER_EMAIL;
const password = process.env.E2E_LEARNER_PASSWORD;

if (!url || !serviceRoleKey || !email || !password) {
  console.log('E2E learner provisioning skipped: required CI secrets are not configured.');
  process.exit(0);
}

const headers = {
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
  'Content-Type': 'application/json',
};

async function request(path, init = {}) {
  const response = await fetch(`${url}/auth/v1/${path}`, {
    ...init,
    headers: { ...headers, ...(init.headers ?? {}) },
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(`Supabase Auth request failed (${response.status}): ${text}`);
  }

  return body;
}

const usersPage = await request('admin/users?page=1&per_page=1000');
const users = Array.isArray(usersPage?.users) ? usersPage.users : [];
const existing = users.find((user) => user.email?.toLowerCase() === email.toLowerCase());

const attributes = {
  email,
  password,
  email_confirm: true,
  user_metadata: {
    full_name: 'ERP Edu E2E Learner',
    purpose: 'ci-e2e',
  },
};

if (existing?.id) {
  await request(`admin/users/${existing.id}`, {
    method: 'PUT',
    body: JSON.stringify(attributes),
  });
  console.log('E2E learner refreshed and confirmed.');
} else {
  await request('admin/users', {
    method: 'POST',
    body: JSON.stringify(attributes),
  });
  console.log('E2E learner created and confirmed.');
}
