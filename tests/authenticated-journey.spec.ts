import { test, expect } from '@playwright/test';

test.describe('Authenticated learner journey', () => {
  test('sign in, verify lesson, persist progress, and unlock next lesson', async ({ page }) => {
    const email = process.env.E2E_LEARNER_EMAIL;
    const password = process.env.E2E_LEARNER_PASSWORD;
    test.skip(!email || !password, 'Requires a pre-confirmed Erpedu CI learner account.');

    await page.goto('/auth');
    await page.getByLabel('Email').fill(email!);
    await page.getByLabel('Password').fill(password!);
    await page.getByRole('button', { name: 'Sign in' }).last().click();

    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 20000 });
    await expect(page.getByText(/SAP MM Level 1/i)).toBeVisible({ timeout: 10000 });

    const session = await page.evaluate(() => window.localStorage.getItem('erp-edu-session'));
    expect(session).toBeTruthy();

    await page.getByRole('link', { name: /Start course|Continue learning/i }).click();
    await expect(page).toHaveURL(/\/courses\/sap-mm-level-1/);

    const alreadyComplete = await page.getByText(/Progress saved\. The next lesson is unlocked\./i).count();
    if (!alreadyComplete) {
      await page.getByLabel('Step 1').fill('identify_need');
      await page.getByLabel('Step 2').fill('purchase');
      await page.getByLabel('Step 3').fill('goods_receipt');
      await page.getByLabel('Step 4').fill('invoice_verification');
      await page.getByRole('button', { name: 'Check & Verify' }).first().click();
      await expect(page.getByText(/Document verified · 100%/i)).toBeVisible({ timeout: 15000 });
      await expect(page.getByText(/Progress saved\. The next lesson is unlocked\./i)).toBeVisible();
    }

    await page.reload();
    await expect(page.getByText(/Checking your saved progress/i)).toHaveCount(0, { timeout: 10000 });
    const locked = await page.getByText(/Lesson locked/i).count();
    expect(locked).toBeLessThan(11);

    await page.goto('/dashboard');
    await expect(page.getByText(/[1-9]\d* of \d+ lessons verified/i)).toBeVisible({ timeout: 10000 });
  });
});
