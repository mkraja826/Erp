import { test, expect } from '@playwright/test';

test.describe('Procure-to-pay simulator runtime', () => {
  test('posts PR to PO to partial GRs, updates inventory, rejects over-receipt, and handles invoice matching', async ({ page }) => {
    test.setTimeout(90000);

    const email = process.env.E2E_LEARNER_EMAIL;
    const password = process.env.E2E_LEARNER_PASSWORD;
    test.skip(!email || !password, 'Requires the Erpedu CI learner account.');

    await page.goto('/auth');
    await page.getByLabel('Email').fill(email!);
    await page.getByLabel('Password').fill(password!);
    await page.getByRole('button', { name: 'Sign in' }).last().click();
    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 20000 });

    const result = await page.evaluate(async () => {
      const raw = window.localStorage.getItem('erp-edu-session');
      if (!raw) throw new Error('Missing stored learner session');
      const session = JSON.parse(raw) as { access_token?: string };
      if (!session.access_token) throw new Error('Missing learner access token');

      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      };

      async function runtime() {
        const response = await fetch('/api/erp-runtime', { headers: { Authorization: headers.Authorization } });
        const body = await response.json();
        if (!response.ok) throw new Error(`Runtime read failed: ${JSON.stringify(body)}`);
        return body;
      }

      async function post(action: string, data: Record<string, unknown>, expectedStatus = 200) {
        const response = await fetch('/api/procurement-flow', {
          method: 'POST',
          headers,
          body: JSON.stringify({ action, data }),
        });
        const body = await response.json();
        if (response.status !== expectedStatus) {
          throw new Error(`${action} returned ${response.status}, expected ${expectedStatus}: ${JSON.stringify(body)}`);
        }
        return body;
      }

      const before = await runtime();
      const baseline = Number((before.inventory ?? []).find((row: Record<string, unknown>) =>
        row.material_code === 'MAT-101' && row.plant_code === 'HYD1' && row.storage_location_code === 'SL01'
      )?.quantity ?? 0);

      const pr = await post('create_pr', { material: 'MAT-101', plant: 'HYD1', quantity: 100 });
      const po = await post('create_po', {
        source_pr: pr.documentNumber,
        vendor: 'VEND-1001',
        purchasing_organization: 'P100',
        unit_price: 12.5,
      });

      const gr1 = await post('post_gr', {
        source_po: po.documentNumber,
        storage_location: 'SL01',
        received_quantity: 60,
      });
      const afterFirstReceipt = await runtime();
      const firstBalance = Number((afterFirstReceipt.inventory ?? []).find((row: Record<string, unknown>) =>
        row.material_code === 'MAT-101' && row.plant_code === 'HYD1' && row.storage_location_code === 'SL01'
      )?.quantity ?? 0);

      const gr2 = await post('post_gr', {
        source_po: po.documentNumber,
        storage_location: 'SL01',
        received_quantity: 40,
      });
      const afterSecondReceipt = await runtime();
      const secondBalance = Number((afterSecondReceipt.inventory ?? []).find((row: Record<string, unknown>) =>
        row.material_code === 'MAT-101' && row.plant_code === 'HYD1' && row.storage_location_code === 'SL01'
      )?.quantity ?? 0);

      const overReceipt = await post('post_gr', {
        source_po: po.documentNumber,
        storage_location: 'SL01',
        received_quantity: 1,
      }, 400);

      const mismatch = await post('post_invoice', {
        source_po: po.documentNumber,
        invoice_value: 1500,
      });
      const matched = await post('post_invoice', {
        source_po: po.documentNumber,
        invoice_value: 1250,
      });

      const flowResponse = await fetch('/api/procurement-flow', {
        headers: { Authorization: headers.Authorization },
      });
      const flow = await flowResponse.json();
      if (!flowResponse.ok) throw new Error(`Flow read failed: ${JSON.stringify(flow)}`);

      return {
        baseline,
        firstBalance,
        secondBalance,
        pr,
        po,
        gr1,
        gr2,
        overReceipt,
        mismatch,
        matched,
        flow,
      };
    });

    expect(result.pr.documentNumber).toMatch(/^PR-/);
    expect(result.po.documentNumber).toMatch(/^PO-/);
    expect(result.po.sourceDocument).toBe(result.pr.documentNumber);

    expect(result.gr1.documentNumber).toMatch(/^GR-/);
    expect(result.gr1.sourceDocument).toBe(result.po.documentNumber);
    expect(result.gr1.openQuantity).toBe(40);
    expect(result.firstBalance).toBe(result.baseline + 60);

    expect(result.gr2.documentNumber).toMatch(/^GR-/);
    expect(result.gr2.sourceDocument).toBe(result.po.documentNumber);
    expect(result.gr2.openQuantity).toBe(0);
    expect(result.secondBalance).toBe(result.baseline + 100);

    expect(result.overReceipt.error).toMatch(/remaining open PO quantity|cannot exceed/i);

    expect(result.mismatch.matchStatus).toBe('mismatch');
    expect(result.mismatch.expectedValue).toBe(1250);
    expect(result.matched.matchStatus).toBe('matched');
    expect(result.matched.expectedValue).toBe(1250);
    expect(result.matched.complete).toBe(true);

    expect(result.flow.stages.requisition).toEqual(expect.arrayContaining([
      expect.objectContaining({ document_number: result.pr.documentNumber, status: 'posted' }),
    ]));
    expect(result.flow.stages.purchaseOrders).toEqual(expect.arrayContaining([
      expect.objectContaining({ document_number: result.po.documentNumber, status: 'posted' }),
    ]));
    expect(result.flow.stages.goodsReceipts).toEqual(expect.arrayContaining([
      expect.objectContaining({ document_number: result.gr1.documentNumber, status: 'posted' }),
      expect.objectContaining({ document_number: result.gr2.documentNumber, status: 'posted' }),
    ]));
    expect(result.flow.stages.invoices).toEqual(expect.arrayContaining([
      expect.objectContaining({ document_number: result.mismatch.documentNumber, status: 'blocked' }),
      expect.objectContaining({ document_number: result.matched.documentNumber, status: 'posted' }),
    ]));
  });
});
