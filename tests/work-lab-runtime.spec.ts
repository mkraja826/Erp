import { test, expect } from '@playwright/test';

const answer = {
  document_type: 'NB',
  vendor: 'VEND-2002',
  material: 'GLV-250',
  quantity: 250,
  plant: 'HYD1',
  purchasing_organization: 'P100',
};

function workLabEmail(base: string) {
  const at = base.lastIndexOf('@');
  return at > 0 ? `${base.slice(0, at)}+worklab${base.slice(at)}` : `${base}+worklab`;
}

test.describe('Authenticated Work Lab runtime', () => {
  test('completed learner can execute a published work ticket and persist the attempt', async ({ page }) => {
    const baseEmail = process.env.E2E_LEARNER_EMAIL;
    const password = process.env.E2E_LEARNER_PASSWORD;
    test.skip(!baseEmail || !password, 'Requires the Erpedu CI learner account.');

    await page.goto('/auth');
    await page.getByLabel('Email').fill(workLabEmail(baseEmail!));
    await page.getByLabel('Password').fill(password!);
    await page.getByRole('button', { name: 'Sign in' }).last().click();
    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 20000 });

    const result = await page.evaluate(async ({ answer }) => {
      const raw = window.localStorage.getItem('erp-edu-session');
      if (!raw) throw new Error('Missing stored learner session');
      const session = JSON.parse(raw) as { access_token?: string };
      if (!session.access_token) throw new Error('Missing learner access token');
      const auth = { Authorization: `Bearer ${session.access_token}` };

      const beforeResponse = await fetch('/api/work-lab', { headers: auth });
      const before = await beforeResponse.json();
      if (!beforeResponse.ok) throw new Error(`Work Lab read failed: ${JSON.stringify(before)}`);
      if (!before.unlocked || !before.tasks?.length) throw new Error('Work Lab is not unlocked or has no published tasks');

      const task = before.tasks[0];
      const submitResponse = await fetch('/api/work-lab', {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: task.id, answer, aiHelpCount: 0 }),
      });
      const submission = await submitResponse.json();
      if (!submitResponse.ok) throw new Error(`Work Lab submit failed: ${JSON.stringify(submission)}`);

      const afterResponse = await fetch('/api/work-lab', { headers: auth });
      const after = await afterResponse.json();
      if (!afterResponse.ok) throw new Error(`Work Lab reread failed: ${JSON.stringify(after)}`);

      return { task, submission, after };
    }, { answer });

    expect(result.task.title).toMatch(/Urgent stock replenishment request/i);
    expect(result.submission.passed).toBe(true);
    expect(result.submission.percentage).toBe(100);
    expect(result.submission.independenceScore).toBe(100);
    expect(result.after.attempts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        task_id: result.task.id,
        score: 100,
        result: 'pass',
        ai_help_count: 0,
      }),
    ]));
  });
});
