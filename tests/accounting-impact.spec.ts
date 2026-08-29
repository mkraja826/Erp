import { test, expect } from '@playwright/test';

test.describe('MM to FI accounting impact', () => {
  test('creates balanced GR and invoice journals, prevents duplicates, and reverses with an audit document', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Desktop lifecycle certification is sufficient; workspace remains responsive by construction.');
    test.setTimeout(90000);
    const email=process.env.E2E_LEARNER_EMAIL;const password=process.env.E2E_LEARNER_PASSWORD;test.skip(!email||!password,'Requires the Erpedu CI learner account.');
    await page.goto('/auth');await page.getByLabel('Email').fill(email!);await page.getByLabel('Password').fill(password!);await page.getByRole('button',{name:'Sign in'}).last().click();await expect(page).toHaveURL(/\/dashboard$/,{timeout:20000});

    const result=await page.evaluate(async()=>{
      const raw=localStorage.getItem('erp-edu-session');if(!raw)throw new Error('Missing learner session');const accessToken=(JSON.parse(raw) as {access_token?:string}).access_token;if(!accessToken)throw new Error('Missing access token');
      const headers={'Content-Type':'application/json',Authorization:`Bearer ${accessToken}`};
      async function post(url:string,action:string,data:Record<string,unknown>,status=200){const r=await fetch(url,{method:'POST',headers,body:JSON.stringify({action,data})});const p=await r.json();if(r.status!==status)throw new Error(`${url} ${action} returned ${r.status}: ${JSON.stringify(p)}`);return p;}
      const runtime=await fetch('/api/erp-runtime',{headers:{Authorization:headers.Authorization}}).then(r=>r.json());
      const materials=(runtime.masterData??[]).filter((x:Record<string,unknown>)=>x.entity_type==='material').slice(0,2);if(materials.length<2)throw new Error('Need two active materials');
      const plant=(runtime.masterData??[]).find((x:Record<string,unknown>)=>x.entity_type==='plant')?.code;const vendor=(runtime.masterData??[]).find((x:Record<string,unknown>)=>x.entity_type==='vendor')?.code;const porg=(runtime.masterData??[]).find((x:Record<string,unknown>)=>x.entity_type==='purchasing_organization')?.code;const storage=(runtime.masterData??[]).find((x:Record<string,unknown>)=>x.entity_type==='storage_location')?.code;
      if(!plant||!vendor||!porg||!storage)throw new Error('Missing active procurement master data');const today=new Date().toISOString().slice(0,10);
      const pr=await post('/api/procurement-flow/multiline','create_pr',{plant,items:[{line_number:10,material:materials[0].code,quantity:2},{line_number:20,material:materials[1].code,quantity:3}]});
      const po=await post('/api/procurement-flow/multiline','create_po',{source_pr:pr.documentNumber,vendor,purchasing_organization:porg,unit_prices:{'10':100,'20':50}});
      const gr=await post('/api/procurement-flow/multiline','post_gr',{source_po:po.documentNumber,posting_date:today,document_date:today,movement_type:'101',items:[{line_number:10,received_quantity:2,storage_location:storage},{line_number:20,received_quantity:3,storage_location:storage}]});
      const iv=await post('/api/procurement-flow/multiline','post_invoice',{source_po:po.documentNumber,supplier_invoice_number:`FI-${Date.now()}`,invoice_date:today,posting_date:today,invoice_value:350});
      const grFi=await post('/api/accounting-impact','post_source',{source_document:gr.documentNumber});
      const duplicate=await post('/api/accounting-impact','post_source',{source_document:gr.documentNumber});
      const ivFi=await post('/api/accounting-impact','post_source',{source_document:iv.documentNumber});
      const reversal=await post('/api/accounting-impact','reverse_fi',{fi_document:ivFi.documentNumber});
      return {grFi,duplicate,ivFi,reversal,gr:gr.documentNumber,iv:iv.documentNumber};
    });

    expect(result.grFi.balanced).toBe(true);expect(result.grFi.debit).toBe(350);expect(result.grFi.credit).toBe(350);expect(result.grFi.items).toEqual(expect.arrayContaining([expect.objectContaining({account:'140000',debit:350}),expect.objectContaining({account:'210000',credit:350})]));
    expect(result.duplicate.duplicate).toBe(true);expect(result.duplicate.documentNumber).toBe(result.grFi.documentNumber);
    expect(result.ivFi.balanced).toBe(true);expect(result.ivFi.debit).toBe(result.ivFi.credit);expect(result.ivFi.items).toEqual(expect.arrayContaining([expect.objectContaining({account:'210000',debit:350}),expect.objectContaining({account:'300000',credit:350})]));
    expect(result.reversal.status).toBe('reversed');expect(result.reversal.balanced).toBe(true);expect(result.reversal.reversalDocument).toMatch(/^FI-/);

    await page.goto('/accounting-impact');await expect(page.getByRole('heading',{name:'See what procurement posts into Finance.'})).toBeVisible();await expect(page.getByText(result.gr)).toBeVisible();await expect(page.getByText(result.grFi.documentNumber)).toBeVisible();
  });
});
