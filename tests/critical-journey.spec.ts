import { test, expect } from '@playwright/test';

const protectedRoutes = ['/dashboard','/skills','/work-lab','/work-lab/incidents','/assessment','/simulator/p2p'];

test.describe('ERP Edu critical learner journey', () => {
  test('public landing exposes learner entry points', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/ERP|Edu/i);
    await expect(page.getByRole('link', { name: /sign in|learner account/i }).first()).toBeVisible();
  });

  test('auth page is reachable', async ({ page }) => {
    await page.goto('/auth');
    await expect(page.getByText(/sign in|create account/i).first()).toBeVisible();
  });

  for (const route of protectedRoutes) {
    test(`${route} does not expose private learner data anonymously`, async ({ page }) => {
      await page.goto(route);
      await page.waitForLoadState('domcontentloaded');
      await expect(page).not.toHaveURL(/error/i);
      const body = await page.locator('body').innerText();
      expect(body).not.toMatch(/service_role|SUPABASE_SERVICE|AI_PROVIDER_API_KEY/i);
    });
  }

  test('certificate verification handles an unknown credential safely', async ({ page }) => {
    await page.goto('/verify/ERP-UNKNOWN-CREDENTIAL');
    await page.waitForLoadState('domcontentloaded');
    const body = await page.locator('body').innerText();
    expect(body).not.toMatch(/service_role|SUPABASE_SERVICE|stack trace/i);
  });
});
