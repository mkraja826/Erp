import { test, expect } from '@playwright/test';

test.describe('Commercial purchasing and tolerance matching', () => {
  test('persists PO commercial terms and distinguishes in-tolerance from blocked invoice variance', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Commercial API lifecycle is certified on desktop; mobile presentation is covered separately.');
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
      async function post(path:string,action:string,data:Record<string,unknown>,expected=200){const r=await fetch(path,{method:'POST',headers,body:JSON.stringify({action,data})});const body=await r.json();if(r.status!==expected)throw new Error(`${action} returned ${r.status}: ${JSON.stringify(body)}`);return body;}
      async function runtime(){const r=await fetch('/api/erp-runtime',{headers:{Authorization:headers.Authorization}});return r.json();}
      const state=await runtime();
      const materials=(state.masterData??[]).filter((x:Record<string,unknown>)=>x.entity_type==='material').slice(0,2).map((x:Record<string,unknown>)=>String(x.code));
      if(materials.length<2)throw new Error('Need two active materials for commercial certification');
      const plant=String((state.masterData??[]).find((x:Record<string,unknown>)=>x.entity_type==='plant')?.code??'HYD1');
      const vendor=String((state.masterData??[]).find((x:Record<string,unknown>)=>x.entity_type==='vendor')?.code??'VEND-1001');
      const porg=String((state.masterData??[]).find((x:Record<string,unknown>)=>x.entity_type==='purchasing_organization')?.code??'P100');
      const storage=String((state.masterData??[]).find((x:Record<string,unknown>)=>x.entity_type==='storage_location')?.code??'SL01');
      const today=new Date().toISOString().slice(0,10);

      const pr=await post('/api/procurement-flow/multiline','create_pr',{plant,items:[{line_number:10,material:materials[0],quantity:2},{line_number:20,material:materials[1],quantity:1}]});
      const po=await post('/api/procurement-flow/multiline','create_po',{source_pr:pr.documentNumber,vendor,purchasing_organization:porg,unit_prices:{'10':100,'20':50}});
      await post('/api/procurement-flow/multiline','post_gr',{source_po:po.documentNumber,posting_date:today,document_date:today,movement_type:'101',items:[{line_number:10,received_quantity:2,storage_location:storage},{line_number:20,received_quantity:1,storage_location:storage}]});
      const terms=await post('/api/procurement-flow/commercial','set_po_terms',{source_po:po.documentNumber,currency:'INR',payment_terms:'NET30',incoterm:'DAP',tax_rate:18,tolerance_abs:2,tolerance_pct:0.5});
      const expectedNet=250; const expectedTax=45; const expectedGross=295;
      const within=await post('/api/procurement-flow/commercial','verify_invoice',{source_po:po.documentNumber,invoice_net:251,invoice_tax:45});
      const blocked=await post('/api/procurement-flow/commercial','verify_invoice',{source_po:po.documentNumber,invoice_net:260,invoice_tax:46});
      return {terms,within,blocked,expectedNet,expectedTax,expectedGross};
    });

    expect(result.terms.currency).toBe('INR');
    expect(result.terms.paymentTerms).toBe('NET30');
    expect(result.terms.incoterm).toBe('DAP');
    expect(result.terms.taxRate).toBe(18);
    expect(result.within.receivedNet).toBe(result.expectedNet);
    expect(result.within.expectedTax).toBe(result.expectedTax);
    expect(result.within.expectedGross).toBe(result.expectedGross);
    expect(result.within.status).toBe('matched');
    expect(result.within.withinTolerance).toBe(true);
    expect(result.within.variance).toBe(1);
    expect(result.blocked.status).toBe('blocked');
    expect(result.blocked.withinTolerance).toBe(false);
    expect(result.blocked.blockReason).toMatch(/exceeds allowed tolerance/i);
  });
});
