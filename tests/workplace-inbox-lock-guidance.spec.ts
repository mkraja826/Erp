import { test, expect } from '@playwright/test';

test.describe('Workplace inbox unlock guidance', () => {
  test('locked learners see the exact SAP MM prerequisite and recovery action', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('erp-edu-session', JSON.stringify({
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        token_type: 'bearer',
        user: { id: 'test-user', email: 'learner@example.com' },
      }));
    });

    await page.route('**/api/workplace-inbox', async route => {
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Workplace inbox locked',
          code: 'SAP_MM_REQUIRED',
          message: 'Complete SAP MM Level 1 to unlock your simulated workplace inbox.',
          requirement: 'SAP MM Level 1 · 100% complete',
          progressPercent: 45,
          enrollmentStatus: 'in_progress',
          actionUrl: '/courses/sap-mm-level-1',
          actionLabel: 'Continue SAP MM',
        }),
      });
    });

    await page.goto('/work-lab/inbox');
    await expect(page.getByRole('heading', { name: 'Workplace inbox locked' })).toBeVisible();
    await expect(page.getByText('SAP MM Level 1 · 100% complete')).toBeVisible();
    await expect(page.getByText(/current SAP MM progress:.*45%/i)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Continue SAP MM' })).toHaveAttribute('href', '/courses/sap-mm-level-1');
    await expect(page.getByRole('button', { name: 'Try again' })).toHaveCount(0);
  });
});
