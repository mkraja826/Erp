import { test, expect } from '@playwright/test';

test.describe('Mobile quiz option layout', () => {
  test('multiple-choice answers render as separate full-width tappable rows', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.toLowerCase().includes('mobile'), 'Mobile regression only.');
    const email = process.env.E2E_LEARNER_EMAIL;
    const password = process.env.E2E_LEARNER_PASSWORD;
    test.skip(!email || !password, 'Requires a pre-confirmed Erpedu CI learner account.');

    await page.goto('/auth');
    await page.getByLabel('Email').fill(email!);
    await page.getByLabel('Password').fill(password!);
    await page.getByRole('button', { name: 'Sign in' }).last().click();
    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 20000 });

    await page.goto('/courses/sap-foundations');
    const group = page.locator('.choiceGroup').first();
    await expect(group).toBeVisible({ timeout: 10000 });
    const options = group.locator('.choiceCard');
    await expect(options).toHaveCount(4);

    const boxes = await options.evaluateAll(nodes => nodes.map(node => {
      const r = node.getBoundingClientRect();
      return { x:r.x, y:r.y, width:r.width, height:r.height };
    }));

    expect(boxes.every(box => box.height >= 48)).toBeTruthy();
    expect(Math.max(...boxes.map(box => box.x)) - Math.min(...boxes.map(box => box.x))).toBeLessThan(2);
    for (let i = 1; i < boxes.length; i++) {
      expect(boxes[i].y).toBeGreaterThan(boxes[i - 1].y + boxes[i - 1].height - 1);
    }
    const widthSpread = Math.max(...boxes.map(box => box.width)) - Math.min(...boxes.map(box => box.width));
    expect(widthSpread).toBeLessThan(2);
  });
});
