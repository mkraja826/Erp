import { test, expect, Page } from '@playwright/test';

async function completeChoice(page: Page, answer: string) {
  const radio = page.getByRole('radio', { name: answer }).first();
  await expect(radio).toBeVisible({ timeout: 10000 });
  await radio.check();
  await radio.locator('xpath=ancestor::form').getByRole('button', { name: 'Check answer' }).click();
  await expect(page.getByText(/Correct — well done!/i).last()).toBeVisible({ timeout: 15000 });
}

test.describe('Authenticated learner journey', () => {
  test('complete SAP Foundations, unlock SAP MM, and persist the transition', async ({ page }) => {
    const email = process.env.E2E_LEARNER_EMAIL;
    const password = process.env.E2E_LEARNER_PASSWORD;
    test.skip(!email || !password, 'Requires a pre-confirmed Erpedu CI learner account.');

    await page.goto('/auth');
    await page.getByLabel('Email').fill(email!);
    await page.getByLabel('Password').fill(password!);
    await page.getByRole('button', { name: 'Sign in' }).last().click();

    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 20000 });
    await expect(page.getByText(/SAP Foundations/i).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/Locked until SAP Foundations is complete/i)).toBeVisible();

    const session = await page.evaluate(() => window.localStorage.getItem('erp-edu-session'));
    expect(session).toBeTruthy();

    await page.goto('/courses/sap-mm-level-1');
    await expect(page.getByText(/SAP Foundations required/i).first()).toBeVisible({ timeout: 10000 });

    await page.goto('/courses/sap-foundations');
    await expect(page).toHaveURL(/\/courses\/sap-foundations/);
    await expect(page.getByText(/What is ERP\?/i).first()).toBeVisible();

    await completeChoice(page, 'To connect departments and business information');
    await completeChoice(page, 'Enterprise software used to run business processes');
    await completeChoice(page, 'MM');
    await completeChoice(page, 'A business need is identified');

    const shortAnswer = page.getByLabel('Type a short answer').first();
    await expect(shortAnswer).toBeVisible({ timeout: 10000 });
    await shortAnswer.fill('master');
    await shortAnswer.locator('xpath=ancestor::form').getByRole('button', { name: 'Check answer' }).click();
    await expect(page.getByText(/Correct — well done!/i).last()).toBeVisible({ timeout: 15000 });

    await page.reload();
    await expect(page.getByText(/Checking your saved progress/i)).toHaveCount(0, { timeout: 10000 });
    await expect(page.getByText(/Lesson locked/i)).toHaveCount(0);

    await page.goto('/dashboard');
    await expect(page.getByText(/5 of 5 lessons verified/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/Foundations complete\. Continue into SAP Materials Management\./i)).toBeVisible();

    await page.getByRole('link', { name: 'Start SAP MM Level 1' }).click();
    await expect(page).toHaveURL(/\/courses\/sap-mm-level-1/);
    await expect(page.getByText(/What is SAP MM\?/i).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/SAP Foundations required/i)).toHaveCount(0);
  });
});
