import { test, expect } from '@playwright/test';

test.describe('Authenticated learner journey', () => {
  test('signup, verify lesson, persist progress, and unlock next lesson', async ({ page }) => {
    const email = `erp-e2e-${Date.now()}-${Math.random().toString(36).slice(2,8)}@example.test`;
    const password = `ErpEdu!${Date.now()}Aa`;

    await page.goto('/auth');
    await page.getByRole('button', { name: 'Create account' }).first().click();
    await page.getByLabel('Full name').fill('ERP Edu E2E Learner');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Create account' }).last().click();

    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 20000 });
    await expect(page.getByText(email)).toBeVisible();
    await expect(page.getByText(/SAP MM Level 1/i)).toBeVisible();

    const session = await page.evaluate(() => window.localStorage.getItem('erp-edu-session'));
    expect(session).toBeTruthy();

    await page.getByRole('link', { name: /Start course|Continue learning/i }).click();
    await expect(page).toHaveURL(/\/courses\/sap-mm-level-1/);

    await page.getByLabel('Step 1').fill('identify_need');
    await page.getByLabel('Step 2').fill('purchase');
    await page.getByLabel('Step 3').fill('goods_receipt');
    await page.getByLabel('Step 4').fill('invoice_verification');
    await page.getByRole('button', { name: 'Check & Verify' }).first().click();

    await expect(page.getByText(/Document verified · 100%/i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/Progress saved\. The next lesson is unlocked\./i)).toBeVisible();

    await page.reload();
    await expect(page.getByText(/Checking your saved progress/i)).toHaveCount(0, { timeout: 10000 });
    await expect(page.getByText(/Lesson locked/i)).toHaveCount(10);

    await page.goto('/dashboard');
    await expect(page.getByText(/1 of \d+ lessons verified/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/Course complete/i)).toBeVisible();
  });
});
