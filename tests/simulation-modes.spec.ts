import { test, expect } from '@playwright/test';

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

test.describe('Procurement simulation modes', () => {
  test('progressively removes coaching and measures requested assistance', async ({ page }) => {
    await signIn(page);
    await page.goto('/procurement-flow');

    const guided = page.getByRole('button', { name: /Guided/ }).first();
    const assisted = page.getByRole('button', { name: /Assisted/ }).first();
    const workplace = page.getByRole('button', { name: /Workplace/ }).first();

    await expect(guided).toBeVisible();
    await expect(page.locator('[data-simulation-mode="guided"]')).toHaveCount(1);
    await expect(page.getByText("What you're learning").first()).toBeVisible();
    await expect(page.getByText('Material master item to be requested')).toBeVisible();
    await expect(page.locator('[data-training-metrics]')).toContainText('82/100');

    await assisted.click();
    await expect(page.locator('[data-simulation-mode="assisted"]')).toHaveCount(1);
    await expect(page.getByText("What you're learning")).toHaveCount(0);
    await expect(page.getByText('Material master item to be requested')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Need a hint' })).toBeVisible();
    await page.getByRole('button', { name: 'Need a hint' }).click();
    await expect(page.getByText("What you're learning").first()).toBeVisible();
    await expect(page.locator('[data-help-requests]')).toContainText('Hints 1');

    await workplace.click();
    await expect(page.locator('[data-simulation-mode="workplace"]')).toHaveCount(1);
    await expect(page.getByText("What you're learning")).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Need a hint' })).toHaveCount(0);
    await expect(page.getByText('Capture an internal material requirement before a supplier order is created.')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Post document' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Finish session' })).toBeVisible();
  });
});
