import { test, expect } from '@playwright/test';

test.describe('Multi-line procure-to-pay runtime', () => {
  test('posts, matches, reverses and reopens a two-line procurement chain', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Desktop certification is sufficient for API lifecycle; mobile UI is certified separately.');
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
      const raw = localStorage.getItem('erp-edu-session');
      if (!raw) throw new Error('Missing learner session');
      const accessToken = (JSON.parse(raw) as { access_token?: string }).access_token;
      if (!accessToken) throw new Error('Missing access token');
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` };
      async function post(action:string,data:Record<string,unknown>,status=200){const response=await fetch('/api/procurement-flow/multiline',{method:'POST',headers,body:JSON.stringify({action,data})});const body=await response.json();if(response.status!==status)throw new Error(`${action} returned ${response.status}: ${JSON.stringify(body)}`);return body;}
      async function runtime(){const response=await fetch('/api/erp-runtime',{headers:{Authorization:headers.Authorization}});return response.json();}
      const today=new Date().toISOString().slice(0,10);
      const before=await runtime();
      const baseline101=Number((before.inventory??[]).find((x:Record<string,unknown>)=>x.material_code==='MAT-101'&&x.plant_code==='HYD1'&&x.storage_location_code==='SL01')?.quantity??0);
      const baseline102=Number((before.inventory??[]).find((x:Record<string,unknown>)=>x.material_code==='MAT-102'&&x.plant_code==='HYD1'&&x.storage_location_code==='SL01')?.quantity??0);
      const pr=await post('create_pr',{plant:'HYD1',items:[{line_number:10,material:'MAT-101',quantity:5},{line_number:20,material:'MAT-102',quantity:3}]});
      const po=await post('create_po',{source_pr:pr.documentNumber,vendor:'VEND-1001',purchasing_organization:'P100',unit_prices:{'10':10,'20':20}});
      const gr=await post('post_gr',{source_po:po.documentNumber,posting_date:today,document_date:today,movement_type:'101',items:[{line_number:10,received_quantity:5,storage_location:'SL01'},{line_number:20,received_quantity:3,storage_location:'SL01'}]});
      const afterGr=await runtime();
      const after101=Number((afterGr.inventory??[]).find((x:Record<string,unknown>)=>x.material_code==='MAT-101'&&x.plant_code==='HYD1'&&x.storage_location_code==='SL01')?.quantity??0);
      const after102=Number((afterGr.inventory??[]).find((x:Record<string,unknown>)=>x.material_code==='MAT-102'&&x.plant_code==='HYD1'&&x.storage_location_code==='SL01')?.quantity??0);
      const mismatch=await post('post_invoice',{source_po:po.documentNumber,supplier_invoice_number:`ML-MIS-${Date.now()}`,invoice_date:today,posting_date:today,invoice_value:115});
      const blockedReplacement=await post('post_invoice',{source_po:po.documentNumber,supplier_invoice_number:`ML-RETRY-${Date.now()}`,invoice_date:today,posting_date:today,invoice_value:110},409);
      const reverseMismatch=await post('reverse_invoice',{source_invoice:mismatch.documentNumber});
      const matched=await post('post_invoice',{source_po:po.documentNumber,supplier_invoice_number:`ML-OK-${Date.now()}`,invoice_date:today,posting_date:today,invoice_value:110});
      const grBlocked=await post('reverse_gr',{source_gr:gr.documentNumber},409);
      const reverseMatched=await post('reverse_invoice',{source_invoice:matched.documentNumber});
      const reverseGr=await post('reverse_gr',{source_gr:gr.documentNumber});
      const finalRuntime=await runtime();
      const final101=Number((finalRuntime.inventory??[]).find((x:Record<string,unknown>)=>x.material_code==='MAT-101'&&x.plant_code==='HYD1'&&x.storage_location_code==='SL01')?.quantity??0);
      const final102=Number((finalRuntime.inventory??[]).find((x:Record<string,unknown>)=>x.material_code==='MAT-102'&&x.plant_code==='HYD1'&&x.storage_location_code==='SL01')?.quantity??0);
      return {baseline101,baseline102,after101,after102,final101,final102,pr,po,gr,mismatch,blockedReplacement,reverseMismatch,matched,grBlocked,reverseMatched,reverseGr};
    });

    expect(result.pr.itemCount).toBe(2);
    expect(result.po.itemCount).toBe(2);
    expect(result.gr.itemCount).toBe(2);
    expect(result.after101).toBe(result.baseline101 + 5);
    expect(result.after102).toBe(result.baseline102 + 3);
    expect(result.mismatch.status).toBe('blocked');
    expect(result.mismatch.receivedValue).toBe(110);
    expect(result.mismatch.variance).toBe(5);
    expect(result.blockedReplacement.error).toMatch(/reverse blocked invoice/i);
    expect(result.reverseMismatch.status).toBe('reversed');
    expect(result.matched.status).toBe('posted');
    expect(result.matched.complete).toBe(true);
    expect(result.matched.poStatus).toBe('closed');
    expect(result.grBlocked.error).toMatch(/reverse active invoice/i);
    expect(result.reverseMatched.status).toBe('reversed');
    expect(result.reverseGr.status).toBe('reversed');
    expect(result.reverseGr.poStatus).toBe('open');
    expect(result.final101).toBe(result.baseline101);
    expect(result.final102).toBe(result.baseline102);
  });
});
