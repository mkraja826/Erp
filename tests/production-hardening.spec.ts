import { test, expect } from '@playwright/test';

test('Phase 7D production baseline exposes valid PWA metadata and authenticated learner flow', async ({ page, request }) => {
  const manifest = await request.get('/manifest.webmanifest');
  expect(manifest.ok(), await manifest.text()).toBeTruthy();
  const body = await manifest.json();
  expect(body).toEqual(expect.objectContaining({ name: 'ERP Edu', display: 'standalone', start_url: '/' }));

  const email = process.env.E2E_LEARNER_EMAIL;
  const password = process.env.E2E_LEARNER_PASSWORD;
  test.skip(!email || !password, 'Requires CI learner.');
  await page.goto('/auth');
  await page.getByLabel('Email').fill(email!);
  await page.getByLabel('Password').fill(password!);
  await page.getByRole('button', { name: 'Sign in' }).last().click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 20000 });

  const session = await page.evaluate(() => JSON.parse(localStorage.getItem('erp-edu-session') || '{}'));
  expect(session.access_token).toBeTruthy();
  expect(session.refresh_token).toBeTruthy();
  expect(Number(session.expires_at)).toBeGreaterThan(Math.floor(Date.now() / 1000));

  const dashboard = await page.evaluate(async () => {
    const token = JSON.parse(localStorage.getItem('erp-edu-session') || '{}').access_token;
    const response = await fetch('/api/dashboard', { headers: { Authorization: `Bearer ${token}` } });
    return { status: response.status, ok: response.ok };
  });
  expect(dashboard).toEqual({ status: 200, ok: true });
});
