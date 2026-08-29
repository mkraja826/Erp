import { test, expect } from '@playwright/test';

test.describe('ERP workplace error messaging', () => {
  test('adapts recovery guidance from Guided to Workplace mode', async ({ page }) => {
    test.setTimeout(60000);
    const email = process.env.E2E_LEARNER_EMAIL;
    const password = process.env.E2E_LEARNER_PASSWORD;
    test.skip(!email || !password, 'Requires the Erpedu CI learner account.');

    await page.goto('/auth');
    await page.getByLabel('Email').fill(email!);
    await page.getByLabel('Password').fill(password!);
    await page.getByRole('button', { name: 'Sign in' }).last().click();
    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 20000 });

    await page.route('**/api/procurement-flow', async route => {
      if (route.request().method() === 'POST') {
        await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'Material is not valid for this plant.' }) });
        return;
      }
      await route.continue();
    });

    async function fillPurchaseRequisition() {
      await page.getByLabel('Material', { exact: true }).selectOption({ index: 1 });
      await page.getByLabel('Plant', { exact: true }).selectOption({ index: 1 });
      await page.getByLabel('Requested quantity', { exact: true }).fill('10');
      await page.getByRole('button', { name: 'Post document' }).click();
    }

    await page.goto('/procurement-flow');
    await expect(page.getByRole('button', { name: /Guided/ })).toHaveClass(/active/);
    await fillPurchaseRequisition();
    const guided = page.getByRole('alert');
    await expect(guided).toContainText('Error · Material is not valid for this plant.');
    await expect(guided).toContainText('Review the material, plant and requested quantity');

    await page.getByRole('button', { name: /Assisted/ }).click();
    await fillPurchaseRequisition();
    const assisted = page.getByRole('alert');
    await expect(assisted).toContainText('Error · Material is not valid for this plant.');
    await expect(assisted).toContainText('Review the purchase requisition data and retry.');
    await expect(assisted).not.toContainText('Review the material, plant and requested quantity');

    await page.getByRole('button', { name: /Workplace/ }).click();
    await fillPurchaseRequisition();
    const workplace = page.getByRole('alert');
    await expect(workplace).toHaveText(/Error · Material is not valid for this plant\./);
    await expect(workplace).not.toContainText('Review the purchase requisition data and retry.');
    await expect(workplace).not.toContainText('Review the material, plant and requested quantity');
  });
});
