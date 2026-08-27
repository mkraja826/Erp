import { test, expect } from '@playwright/test';

const exerciseId = 'd21345e6-726a-4d20-a6c4-3fb8283686d5';
const answer = {
  document_type: 'NB',
  vendor: 'VEND-1001',
  material: 'MAT-101',
  quantity: 100,
  plant: 'HYD1',
  purchasing_organization: 'P100',
};

test.describe('Authenticated ERP transaction runtime', () => {
  test('verify a PO exercise, post the ERP document, and read it back', async ({ page }) => {
    const email = process.env.E2E_LEARNER_EMAIL;
    const password = process.env.E2E_LEARNER_PASSWORD;
    test.skip(!email || !password, 'Requires the Erpedu CI learner account.');

    await page.goto('/auth');
    await page.getByLabel('Email').fill(email!);
    await page.getByLabel('Password').fill(password!);
    await page.getByRole('button', { name: 'Sign in' }).last().click();
    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 20000 });

    const result = await page.evaluate(async ({ exerciseId, answer }) => {
      const raw = window.localStorage.getItem('erp-edu-session');
      if (!raw) throw new Error('Missing stored learner session');
      const session = JSON.parse(raw) as { access_token?: string };
      if (!session.access_token) throw new Error('Missing learner access token');
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      };

      const verifyResponse = await fetch('/api/verify', {
        method: 'POST',
        headers,
        body: JSON.stringify({ exerciseId, answer }),
      });
      const verification = await verifyResponse.json();
      if (!verifyResponse.ok) throw new Error(`Verify failed: ${JSON.stringify(verification)}`);

      const postResponse = await fetch('/api/erp-runtime', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          documentType: 'MM-PO',
          header: answer,
          items: [],
          sourceExerciseId: exerciseId,
        }),
      });
      const posted = await postResponse.json();
      if (!postResponse.ok) throw new Error(`Post failed: ${JSON.stringify(posted)}`);

      const runtimeResponse = await fetch('/api/erp-runtime', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const runtime = await runtimeResponse.json();
      if (!runtimeResponse.ok) throw new Error(`Runtime read failed: ${JSON.stringify(runtime)}`);

      return { verification, posted, runtime };
    }, { exerciseId, answer });

    expect(result.verification.passed).toBe(true);
    expect(result.verification.percentage).toBe(100);
    expect(result.posted.posted).toBe(true);
    expect(result.posted.documentNumber).toMatch(/^MMPO-/);
    expect(result.runtime.documents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        document_number: result.posted.documentNumber,
        document_type: 'MM-PO',
        status: 'posted',
      }),
    ]));
  });
});
