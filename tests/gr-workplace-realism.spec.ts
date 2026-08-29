import { test, expect } from '@playwright/test';

test.describe('Goods receipt workplace realism', () => {
  test('persists posting dates, movement type, receipt history and open quantity', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Runtime behavior is certified once; mobile layout is covered separately.');
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
      if (!raw) throw new Error('Missing session');
      const token = (JSON.parse(raw) as { access_token?: string }).access_token;
      if (!token) throw new Error('Missing token');
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
      async function post(action:string,data:Record<string,unknown>,status=200){
        const response=await fetch('/api/procurement-flow',{method:'POST',headers,body:JSON.stringify({action,data})});
        const body=await response.json();
        if(response.status!==status)throw new Error(`${action}: ${response.status} ${JSON.stringify(body)}`);
        return body;
      }
      async function flow(){const response=await fetch('/api/procurement-flow',{headers:{Authorization:headers.Authorization}});return response.json();}

      const pr=await post('create_pr',{material:'MAT-101',plant:'HYD1',quantity:25});
      const po=await post('create_po',{source_pr:pr.documentNumber,vendor:'VEND-1001',purchasing_organization:'P100',unit_price:10});
      const invalidMovement=await post('post_gr',{source_po:po.documentNumber,storage_location:'SL01',received_quantity:5,posting_date:'2026-08-29',document_date:'2026-08-29',movement_type:'102'},400);
      const invalidDate=await post('post_gr',{source_po:po.documentNumber,storage_location:'SL01',received_quantity:5,posting_date:'2026-08-28',document_date:'2026-08-29',movement_type:'101'},400);
      const gr1=await post('post_gr',{source_po:po.documentNumber,storage_location:'SL01',received_quantity:10,posting_date:'2026-08-29',document_date:'2026-08-28',movement_type:'101'});
      const gr2=await post('post_gr',{source_po:po.documentNumber,storage_location:'SL01',received_quantity:15,posting_date:'2026-08-29',document_date:'2026-08-29',movement_type:'101'});
      const final=await flow();
      return {po,gr1,gr2,invalidMovement,invalidDate,final};
    });

    expect(result.invalidMovement.error).toMatch(/movement type 101/i);
    expect(result.invalidDate.error).toMatch(/document date cannot be after posting date/i);
    expect(result.gr1).toMatchObject({movementType:'101',postingDate:'2026-08-29',documentDate:'2026-08-28',orderedQuantity:25,previouslyReceived:0,receivedQuantity:10,openQuantity:15,poStatus:'partially_received'});
    expect(result.gr2).toMatchObject({movementType:'101',postingDate:'2026-08-29',documentDate:'2026-08-29',orderedQuantity:25,previouslyReceived:10,receivedQuantity:15,openQuantity:0,poStatus:'fully_received'});

    const persisted = result.final.stages.goodsReceipts.filter((row: any) => row.header.source_po === result.po.documentNumber);
    expect(persisted).toEqual(expect.arrayContaining([
      expect.objectContaining({header:expect.objectContaining({movement_type:'101',posting_date:'2026-08-29',document_date:'2026-08-28',ordered_quantity:25,previously_received_quantity:0,open_quantity_before:25,open_quantity_after:15,po_receipt_status:'partially_received'})}),
      expect.objectContaining({header:expect.objectContaining({movement_type:'101',posting_date:'2026-08-29',document_date:'2026-08-29',ordered_quantity:25,previously_received_quantity:10,open_quantity_before:15,open_quantity_after:0,po_receipt_status:'fully_received'})}),
    ]));
  });
});
