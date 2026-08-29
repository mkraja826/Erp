import { test, expect } from '@playwright/test';

test.describe('Vendor payment and clearing', () => {
  test('clears an invoice FI item, blocks duplicate payment, and reopens it after reversal', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Desktop lifecycle certification is sufficient.');
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
      if(!plant||!vendor||!porg||!storage)throw new Error('Missing procurement master data');const today=new Date().toISOString().slice(0,10);
      const pr=await post('/api/procurement-flow/multiline','create_pr',{plant,items:[{line_number:10,material:materials[0].code,quantity:1},{line_number:20,material:materials[1].code,quantity:2}]});
      const po=await post('/api/procurement-flow/multiline','create_po',{source_pr:pr.documentNumber,vendor,purchasing_organization:porg,unit_prices:{'10':200,'20':75}});
      const gr=await post('/api/procurement-flow/multiline','post_gr',{source_po:po.documentNumber,posting_date:today,document_date:today,movement_type:'101',items:[{line_number:10,received_quantity:1,storage_location:storage},{line_number:20,received_quantity:2,storage_location:storage}]});
      const iv=await post('/api/procurement-flow/multiline','post_invoice',{source_po:po.documentNumber,supplier_invoice_number:`PAY-${Date.now()}`,invoice_date:today,posting_date:today,invoice_value:350});
      await post('/api/accounting-impact','post_source',{source_document:gr.documentNumber});
      const invoiceFi=await post('/api/accounting-impact','post_source',{source_document:iv.documentNumber});
      const payment=await post('/api/vendor-payment','post_payment',{invoice_fi:invoiceFi.documentNumber,payment_amount:350,payment_date:today,bank_reference:`UTR-${Date.now()}`});
      const duplicate=await post('/api/vendor-payment','post_payment',{invoice_fi:invoiceFi.documentNumber,payment_amount:350,payment_date:today,bank_reference:'DUPLICATE'},409);
      const reversal=await post('/api/vendor-payment','reverse_payment',{payment_document:payment.documentNumber});
      const runtimeAfter=await fetch('/api/erp-runtime',{headers:{Authorization:headers.Authorization}}).then(r=>r.json());const fiAfter=(runtimeAfter.documents??[]).find((d:Record<string,unknown>)=>d.document_number===invoiceFi.documentNumber);
      return {invoiceFi,payment,duplicate,reversal,fiAfter};
    });

    expect(result.payment.clearingStatus).toBe('cleared');expect(result.payment.paymentAmount).toBe(350);expect(result.payment.items).toEqual(expect.arrayContaining([expect.objectContaining({account:'300000',debit:350}),expect.objectContaining({account:'110000',credit:350})]));
    expect(result.duplicate.error).toMatch(/already cleared|already clears/i);
    expect(result.reversal.clearingStatus).toBe('open');expect(result.reversal.reversalDocument).toMatch(/^FI-/);expect(result.fiAfter.header.clearing_status).toBe('open');

    await page.goto('/vendor-payments');await expect(page.getByRole('heading',{name:'Clear vendor open items with payment.'})).toBeVisible();await expect(page.getByRole('cell',{name:result.invoiceFi.documentNumber,exact:true})).toBeVisible();
  });
});
