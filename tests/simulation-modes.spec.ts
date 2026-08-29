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
  test('progressively removes coaching from guided to assisted to workplace', async ({ page }) => {
    await signIn(page);
    await page.goto('/procurement-flow');

    await expect(page.getByText("What you're learning")).toBeVisible();
    await expect(page.getByText('Material master item to be requested')).toBeVisible();
    await expect(page.getByText('Guided Simulation').last()).toBeVisible();

    await page.getByRole('button', { name: /Assisted/ }).first().click();
    await expect(page.getByText("What you're learning")).toBeVisible();
    await expect(page.getByText('Material master item to be requested')).toHaveCount(0);
    await expect(page.getByText('Assisted Simulation').last()).toBeVisible();

    await page.getByRole('button', { name: /Workplace/ }).first().click();
    await expect(page.getByText("What you're learning")).toHaveCount(0);
    await expect(page.getByText('Capture an internal material requirement before a supplier order is created.')).toHaveCount(0);
    await expect(page.getByText('Workplace Simulation').last()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Post document' })).toBeVisible();
  });
});
