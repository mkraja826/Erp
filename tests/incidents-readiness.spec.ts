import { test, expect } from '@playwright/test';

function workLabEmail(base: string) {
  const at = base.lastIndexOf('@');
  return at > 0 ? `${base.slice(0, at)}+worklab${base.slice(at)}` : `${base}+worklab`;
}

async function signInCompletedLearner(page: import('@playwright/test').Page) {
  const baseEmail = process.env.E2E_LEARNER_EMAIL;
  const password = process.env.E2E_LEARNER_PASSWORD;
  test.skip(!baseEmail || !password, 'Requires the Erpedu CI learner account.');
  await page.goto('/auth');
  await page.getByLabel('Email').fill(workLabEmail(baseEmail!));
  await page.getByLabel('Password').fill(password!);
  await page.getByRole('button', { name: 'Sign in' }).last().click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 20000 });
}

function readinessAnswers() {
  return {
    open_quantity: 35,
    invoice_status: 'blocked',
    allowed_receipt: 35,
    inventory_action: 'stock_transfer',
    process_sequence: 'pr_po_gr_invoice',
    support_root_cause: 'invoice_exceeds_received_value',
    price_exception_action: 'hold_and_verify_price_change',
    supported_invoice_value: 15000,
  };
}

test.describe('Work Lab incidents and job readiness', () => {
  test('completed learner can resolve a generated PO incident and persist the attempt', async ({ page }) => {
    await signInCompletedLearner(page);

    const result = await page.evaluate(async () => {
      const raw = window.localStorage.getItem('erp-edu-session');
      if (!raw) throw new Error('Missing stored learner session');
      const session = JSON.parse(raw) as { access_token?: string };
      if (!session.access_token) throw new Error('Missing learner access token');
      const auth = { Authorization: `Bearer ${session.access_token}` };
      const jsonHeaders = { ...auth, 'Content-Type': 'application/json' };

      const postDocResponse = await fetch('/api/erp-runtime', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({
          documentType: 'PO',
          header: { vendor: 'VEND-2002', plant: 'HYD1' },
          items: [{ material: 'GLV-250', quantity: 250 }],
        }),
      });
      const posted = await postDocResponse.json();
      if (!postDocResponse.ok) throw new Error(`PO post failed: ${JSON.stringify(posted)}`);

      const incidentsResponse = await fetch('/api/work-lab/incidents', { headers: auth });
      const incidentData = await incidentsResponse.json();
      if (!incidentsResponse.ok) throw new Error(`Incident read failed: ${JSON.stringify(incidentData)}`);
      const incident = incidentData.incidents?.find((row: { source_document_number?: string; incident_type?: string }) =>
        row.source_document_number === posted.documentNumber && row.incident_type === 'po_no_receipt'
      );
      if (!incident) throw new Error(`Expected PO incident was not generated for ${posted.documentNumber}`);

      const submitResponse = await fetch('/api/work-lab/incidents', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({
          incidentId: incident.id,
          rootCause: 'No goods receipt has been posted for this purchase order.',
          resolution: 'Confirm delivery with the warehouse and post goods receipt before proceeding.',
          aiHelpCount: 0,
        }),
      });
      const submission = await submitResponse.json();
      if (!submitResponse.ok) throw new Error(`Incident submit failed: ${JSON.stringify(submission)}`);

      const afterResponse = await fetch('/api/work-lab/incidents', { headers: auth });
      const after = await afterResponse.json();
      if (!afterResponse.ok) throw new Error(`Incident reread failed: ${JSON.stringify(after)}`);
      return { posted, incident, submission, after };
    });

    expect(result.submission.passed).toBe(true);
    expect(result.submission.score).toBe(100);
    expect(result.submission.independenceScore).toBe(100);
    expect(result.after.incidents).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: result.incident.id, status: 'resolved' }),
    ]));
    expect(result.after.attempts).toEqual(expect.arrayContaining([
      expect.objectContaining({ incident_id: result.incident.id, score: 100, result: 'pass', ai_help_count: 0 }),
    ]));
  });

  test('completed learner can pass and persist the published job-readiness assessment', async ({ page }) => {
    await signInCompletedLearner(page);
    const answers = readinessAnswers();

    const result = await page.evaluate(async ({ answers }) => {
      const raw = window.localStorage.getItem('erp-edu-session');
      if (!raw) throw new Error('Missing stored learner session');
      const session = JSON.parse(raw) as { access_token?: string };
      if (!session.access_token) throw new Error('Missing learner access token');
      const auth = { Authorization: `Bearer ${session.access_token}` };
      const jsonHeaders = { ...auth, 'Content-Type': 'application/json' };

      const beforeResponse = await fetch('/api/job-readiness', { headers: auth });
      const before = await beforeResponse.json();
      if (!beforeResponse.ok) throw new Error(`Readiness read failed: ${JSON.stringify(before)}`);
      if (!before.eligible) throw new Error('Completed learner is unexpectedly ineligible for job readiness');

      const startResponse = await fetch('/api/job-readiness', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ action: 'start' }),
      });
      const started = await startResponse.json();
      if (!startResponse.ok || !started.attemptId) throw new Error(`Readiness start failed: ${JSON.stringify(started)}`);

      const submitResponse = await fetch('/api/job-readiness', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ action: 'submit', attemptId: started.attemptId, answers }),
      });
      const submission = await submitResponse.json();
      if (!submitResponse.ok) throw new Error(`Readiness submit failed: ${JSON.stringify(submission)}`);

      const afterResponse = await fetch('/api/job-readiness', { headers: auth });
      const after = await afterResponse.json();
      if (!afterResponse.ok) throw new Error(`Readiness reread failed: ${JSON.stringify(after)}`);
      return { before, started, submission, after };
    }, { answers });

    expect(result.before.assessment.title).toMatch(/SAP MM Foundation Job-Readiness Assessment/i);
    expect(result.submission.passed).toBe(true);
    expect(result.submission.score).toBe(100);
    expect(result.submission.independenceScore).toBe(100);
    expect(result.submission.status).toBe('passed');
    expect(result.after.attempts).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: result.started.attemptId, status: 'passed', score: 100, independence_score: 100 }),
    ]));
  });
});
