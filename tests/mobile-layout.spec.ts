import { test, expect } from '@playwright/test';

async function expectNoHorizontalOverflow(page: import('@playwright/test').Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

async function signIn(page: import('@playwright/test').Page) {
  const email = process.env.E2E_LEARNER_EMAIL;
  const password = process.env.E2E_LEARNER_PASSWORD;
  test.skip(!email || !password, 'Requires a pre-confirmed Erpedu CI learner account.');
  await page.goto('/auth');
  await page.getByLabel('Email').fill(email!);
  await page.getByLabel('Password').fill(password!);
  await page.getByRole('button', { name: 'Sign in' }).last().click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 20000 });
}

test.describe('Mobile layout regression', () => {
  test.skip(({ browserName }, testInfo) => browserName !== 'chromium' || testInfo.project.name !== 'mobile-chromium', 'Mobile viewport only.');

  test('public home and auth remain mobile-safe', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: /Start SAP MM/i })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.goto('/auth');
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in' }).last()).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test('dashboard and course remain mobile-safe after sign in', async ({ page }) => {
    await signIn(page);
    await expect(page.getByRole('link', { name: /Start course|Continue learning/i })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.getByRole('link', { name: /Start course|Continue learning/i }).click();
    await expect(page).toHaveURL(/\/courses\/sap-mm-level-1/);
    await expect(page.getByText(/One small step at a time/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Check & Verify/i }).first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
