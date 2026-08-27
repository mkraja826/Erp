import { test, expect } from '@playwright/test';

function taggedEmail(base: string, tag: string) {
  const at = base.lastIndexOf('@');
  return at > 0 ? `${base.slice(0, at)}+${tag}${base.slice(at)}` : `${base}+${tag}`;
}

async function parseJson(response: import('@playwright/test').APIResponse) {
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

test.describe('Cross-user data isolation', () => {
  test('learner A cannot read or modify learner B private records', async ({ page, request }) => {
    const baseEmail = process.env.E2E_LEARNER_EMAIL;
    const password = process.env.E2E_LEARNER_PASSWORD;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    test.skip(
      !baseEmail || !password || !supabaseUrl || !publishableKey || !serviceRoleKey,
      'Requires ERP Edu authenticated E2E and Supabase CI secrets.',
    );

    const learnerAEmail = taggedEmail(baseEmail!, 'isolation-a');
    const learnerBEmail = taggedEmail(baseEmail!, 'isolation-b');

    const adminHeaders = {
      apikey: serviceRoleKey!,
      Authorization: `Bearer ${serviceRoleKey!}`,
    };

    const usersResponse = await request.get(`${supabaseUrl}/auth/v1/admin/users?page=1&per_page=1000`, {
      headers: adminHeaders,
    });
    expect(usersResponse.ok(), `Unable to read CI auth users: ${await usersResponse.text()}`).toBe(true);
    const usersBody = await parseJson(usersResponse) as { users?: Array<{ id: string; email?: string }> };
    const learnerB = usersBody.users?.find((user) => user.email?.toLowerCase() === learnerBEmail.toLowerCase());
    expect(learnerB?.id, 'Isolation learner B must be provisioned before the browser suite.').toBeTruthy();

    const courseResponse = await request.get(`${supabaseUrl}/rest/v1/courses?slug=eq.sap-mm-level-1&select=id&limit=1`, {
      headers: adminHeaders,
    });
    expect(courseResponse.ok(), `Unable to read SAP MM course: ${await courseResponse.text()}`).toBe(true);
    const courses = await parseJson(courseResponse) as Array<{ id: string }>;
    const courseId = courses[0]?.id;
    expect(courseId).toBeTruthy();

    await page.goto('/auth');
    await page.getByLabel('Email').fill(learnerAEmail);
    await page.getByLabel('Password').fill(password!);
    await page.getByRole('button', { name: 'Sign in' }).last().click();
    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 20000 });

    const accessToken = await page.evaluate(() => {
      const raw = window.localStorage.getItem('erp-edu-session');
      if (!raw) throw new Error('Missing stored learner session');
      const session = JSON.parse(raw) as { access_token?: string };
      if (!session.access_token) throw new Error('Missing learner access token');
      return session.access_token;
    });

    const learnerHeaders = {
      apikey: publishableKey!,
      Authorization: `Bearer ${accessToken}`,
    };

    const privateProfileResponse = await request.get(
      `${supabaseUrl}/rest/v1/profiles?id=eq.${learnerB!.id}&select=id,full_name`,
      { headers: learnerHeaders },
    );
    expect(privateProfileResponse.ok()).toBe(true);
    expect(await parseJson(privateProfileResponse)).toEqual([]);

    const privateEnrollmentResponse = await request.get(
      `${supabaseUrl}/rest/v1/enrollments?user_id=eq.${learnerB!.id}&course_id=eq.${courseId}&select=user_id,status,progress_percent`,
      { headers: learnerHeaders },
    );
    expect(privateEnrollmentResponse.ok()).toBe(true);
    expect(await parseJson(privateEnrollmentResponse)).toEqual([]);

    const mutateResponse = await request.patch(
      `${supabaseUrl}/rest/v1/enrollments?user_id=eq.${learnerB!.id}&course_id=eq.${courseId}`,
      {
        headers: {
          ...learnerHeaders,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        data: { progress_percent: 99 },
      },
    );
    expect(mutateResponse.ok(), `Cross-user update should be filtered by RLS, not crash: ${await mutateResponse.text()}`).toBe(true);
    expect(await parseJson(mutateResponse)).toEqual([]);

    const verifyResponse = await request.get(
      `${supabaseUrl}/rest/v1/enrollments?user_id=eq.${learnerB!.id}&course_id=eq.${courseId}&select=user_id,status,progress_percent&limit=1`,
      { headers: adminHeaders },
    );
    expect(verifyResponse.ok(), `Unable to verify isolation marker: ${await verifyResponse.text()}`).toBe(true);
    const verified = await parseJson(verifyResponse) as Array<{ user_id: string; status: string; progress_percent: number }>;
    expect(verified[0]).toMatchObject({
      user_id: learnerB!.id,
      status: 'active',
      progress_percent: 42,
    });
  });
});
