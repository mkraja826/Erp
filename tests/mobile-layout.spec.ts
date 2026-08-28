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
  test('public home and auth remain mobile-safe', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-chromium', 'Mobile viewport only.');

    await page.goto('/');
    await expect(page.getByRole('link', { name: /Start SAP Foundations/i })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.goto('/auth');
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in' }).last()).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test('dashboard and Foundations course remain mobile-safe after sign in', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-chromium', 'Mobile viewport only.');

    await signIn(page);
    await expect(page.getByRole('link', { name: /Start SAP Foundations|Continue SAP Foundations/i })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.getByRole('link', { name: /Start SAP Foundations|Continue SAP Foundations/i }).click();
    await expect(page).toHaveURL(/\/courses\/sap-foundations/);
    await expect(page.getByText(/One small step at a time/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Check answer/i }).first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
