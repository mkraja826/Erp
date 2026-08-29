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

  test('procurement workplace remains operable on a phone viewport', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-chromium', 'Mobile viewport only.');

    await signIn(page);
    await page.goto('/procurement-flow');
    await page.getByRole('button', { name: /Workplace/ }).click();
    await expect(page.getByRole('button', { name: /Workplace/ })).toHaveClass(/active/);
    await expectNoHorizontalOverflow(page);

    const requirementSection = page.locator('section').filter({ hasText: 'Requirement data' }).first();
    const selects = requirementSection.locator('select');
    const quantity = requirementSection.locator('input[type="number"]').first();
    await expect(selects).toHaveCount(2);
    await expect(quantity).toBeVisible();

    const businessControls = [selects.nth(0), selects.nth(1), quantity];
    for (const control of businessControls) {
      await expect(control).toBeVisible();
      const height = await control.evaluate(element => element.getBoundingClientRect().height);
      expect(height).toBeGreaterThanOrEqual(44);
    }

    await selects.nth(0).selectOption({ index: 1 });
    await selects.nth(1).selectOption({ index: 1 });
    await quantity.fill('10');

    const postButton = page.getByRole('button', { name: 'Post document' });
    await postButton.scrollIntoViewIfNeeded();
    await expect(postButton).toBeVisible();
    const postHeight = await postButton.evaluate(element => element.getBoundingClientRect().height);
    expect(postHeight).toBeGreaterThanOrEqual(44);
    await expectNoHorizontalOverflow(page);

    const itemTable = page.locator('table').first();
    await expect(itemTable).toBeVisible();
    const tableContained = await itemTable.evaluate(element => {
      const wrapper = element.parentElement;
      if (!wrapper) return false;
      return wrapper.clientWidth <= document.documentElement.clientWidth && wrapper.scrollWidth >= wrapper.clientWidth;
    });
    expect(tableContained).toBeTruthy();
  });
});
