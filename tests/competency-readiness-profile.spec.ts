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

async function token(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const raw = window.localStorage.getItem('erp-edu-session');
    if (!raw) throw new Error('Missing learner session');
    return (JSON.parse(raw) as { access_token:string }).access_token;
  });
}

test.describe('Phase 6C competency readiness profile', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Durable aggregation is certified once on desktop.');

  test('aggregates training evidence into one durable competency profile', async ({ page, request }) => {
    await signIn(page);
    const accessToken = await token(page);
    const headers = { Authorization: `Bearer ${accessToken}` };
    const sessionId = `phase6c-${Date.now()}`;

    const training = await request.post('/api/training-session', {
      headers,
      data: {
        session_id: sessionId,
        transaction: 'Purchase Requisition',
        title: 'Phase 6C certification',
        mode: 'workplace',
        elapsed_ms: 120000,
        mistakes: 1,
        corrections: 1,
        help_requests: 0,
        mode_switches: 0,
        completed: true,
      },
    });
    expect(training.ok(), await training.text()).toBeTruthy();

    const first = await request.get('/api/skills-profile', { headers });
    expect(first.ok(), await first.text()).toBeTruthy();
    const profile = await first.json();
    expect(profile.evidence.trainingSessions).toBeGreaterThanOrEqual(1);
    expect(profile.skills.transactionAccuracy).toBeGreaterThanOrEqual(90);
    expect(profile.skills.trainingIndependence).toBeGreaterThanOrEqual(90);
    expect(profile.skills.overall).toBeGreaterThanOrEqual(0);
    expect(profile.skills.readinessBand).toMatch(/foundation|developing|applied|workplace_ready|certified/);
    expect(profile.competencyProfile.documentNumber).toMatch(/^CMP-/);

    const second = await request.get('/api/skills-profile', { headers });
    expect(second.ok(), await second.text()).toBeTruthy();
    const recalculated = await second.json();
    expect(recalculated.competencyProfile.documentNumber).toBe(profile.competencyProfile.documentNumber);
    expect(recalculated.evidence.trainingSessions).toBe(profile.evidence.trainingSessions);
  });
});
