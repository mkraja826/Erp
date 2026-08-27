import { test, expect } from '@playwright/test';

test.describe('Authenticated learner journey', () => {
  test('real signup creates learner session, enrollment, and persisted dashboard access', async ({ page }) => {
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
    await expect(page.getByText(/Course complete/i)).toBeVisible();

    const session = await page.evaluate(() => window.localStorage.getItem('erp-edu-session'));
    expect(session).toBeTruthy();

    await page.reload();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText(email)).toBeVisible();

    await page.getByRole('link', { name: /Start course|Continue learning/i }).click();
    await expect(page).toHaveURL(/\/courses\/sap-mm-level-1/);
    await expect(page.getByText(/SAP MM/i).first()).toBeVisible();

    await page.goto('/dashboard');
    await expect(page.getByText(email)).toBeVisible();
    await expect(page.getByText(/0 of \d+ lessons verified/i)).toBeVisible();
  });
});
