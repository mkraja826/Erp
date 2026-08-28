import { test, expect, Page } from '@playwright/test';

async function waitForSavedProgress(page: Page) {
  await expect(page.getByText(/Lesson complete\. Your progress is saved and the next lesson is unlocked\./i).last()).toBeVisible({ timeout: 15000 });
  await page.reload();
  await expect(page.getByText(/Checking your saved progress/i)).toHaveCount(0, { timeout: 10000 });
}

async function completeChoice(page: Page, question: string, answer: string) {
  const exercise = page.locator('.lessonExercise').filter({ hasText: question }).first();
  await expect(exercise).toBeVisible({ timeout: 10000 });
  const radio = exercise.getByRole('radio', { name: answer });
  await expect(radio).toBeVisible({ timeout: 10000 });
  await radio.check();
  await expect(radio).toBeChecked();
  await exercise.getByRole('button', { name: 'Check answer' }).click();
  await waitForSavedProgress(page);
}

test.describe('Authenticated learner journey', () => {
  test('complete SAP Foundations, unlock SAP MM, and persist the transition', async ({ page }) => {
    test.setTimeout(90000);

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

    await completeChoice(page, 'Why does a company use an ERP system?', 'To connect departments and business information');
    await completeChoice(page, 'SAP is best described as which of these?', 'Enterprise software used to run business processes');
    await completeChoice(page, 'Which SAP module focuses on materials and purchasing?', 'MM');
    await completeChoice(page, 'In a simple purchasing process, what happens first?', 'A business need is identified');

    const exercise = page.locator('.lessonExercise').filter({ hasText: 'A supplier record is an example of ____ data.' }).first();
    await expect(exercise).toBeVisible({ timeout: 10000 });
    const shortAnswer = exercise.getByLabel('Type a short answer');
    await expect(shortAnswer).toBeVisible({ timeout: 10000 });
    await shortAnswer.fill('master');
    await exercise.getByRole('button', { name: 'Check answer' }).click();
    await waitForSavedProgress(page);
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
