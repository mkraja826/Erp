import { test, expect } from '@playwright/test';

test.describe('Authenticated learner journey', () => {
  test('sign in, start SAP Foundations, persist progress, and keep SAP MM gated', async ({ page }) => {
    const email = process.env.E2E_LEARNER_EMAIL;
    const password = process.env.E2E_LEARNER_PASSWORD;
    test.skip(!email || !password, 'Requires a pre-confirmed Erpedu CI learner account.');

    await page.goto('/auth');
    await page.getByLabel('Email').fill(email!);
    await page.getByLabel('Password').fill(password!);
    await page.getByRole('button', { name: 'Sign in' }).last().click();

    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 20000 });
    await expect(page.getByText(/SAP Foundations/i).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/SAP MM Level 1/i).first()).toBeVisible({ timeout: 10000 });

    const session = await page.evaluate(() => window.localStorage.getItem('erp-edu-session'));
    expect(session).toBeTruthy();

    await page.getByRole('link', { name: /Start SAP Foundations|Continue SAP Foundations/i }).click();
    await expect(page).toHaveURL(/\/courses\/sap-foundations/);
    await expect(page.getByText(/What is ERP\?/i).first()).toBeVisible();

    const alreadyComplete = await page.getByText(/Lesson complete\. Your progress is saved and the next lesson is unlocked\./i).count();
    if (!alreadyComplete) {
      await page.getByRole('radio', { name: 'To connect departments and business information' }).first().check();
      await page.getByRole('button', { name: 'Check answer' }).first().click();
      await expect(page.getByText(/Correct — well done!/i).first()).toBeVisible({ timeout: 15000 });
      await expect(page.getByText(/Lesson complete\. Your progress is saved and the next lesson is unlocked\./i).first()).toBeVisible();
    }

    await page.reload();
    await expect(page.getByText(/Checking your saved progress/i)).toHaveCount(0, { timeout: 10000 });
    const locked = await page.getByText(/Lesson locked/i).count();
    expect(locked).toBeLessThan(5);

    await page.goto('/dashboard');
    await expect(page.getByText(/[1-9]\d* of 5 lessons verified/i)).toBeVisible({ timeout: 10000 });
  });
});
