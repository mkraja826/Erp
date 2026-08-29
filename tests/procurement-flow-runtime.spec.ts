import { test, expect } from '@playwright/test';

test.describe('Procure-to-pay simulator runtime', () => {
  test('enforces master data and runs a certified procure-to-pay chain with reversals', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'API lifecycle runs once on desktop; mobile behavior is certified separately.');
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
      const headers = {'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`};
      async function runtime(){const response=await fetch('/api/erp-runtime',{headers:{Authorization:headers.Authorization}});const body=await response.json();if(!response.ok)throw new Error(`Runtime read failed: ${JSON.stringify(body)}`);return body;}
      async function flow(){const response=await fetch('/api/procurement-flow',{headers:{Authorization:headers.Authorization}});const body=await response.json();if(!response.ok)throw new Error(`Flow read failed: ${JSON.stringify(body)}`);return body;}
      async function post(action:string,data:Record<string,unknown>,expectedStatus=200){const response=await fetch('/api/procurement-flow',{method:'POST',headers,body:JSON.stringify({action,data})});const body=await response.json();if(response.status!==expectedStatus)throw new Error(`${action} returned ${response.status}, expected ${expectedStatus}: ${JSON.stringify(body)}`);return body;}
      const today=new Date().toISOString().slice(0,10);
      const invalidMaterial=await post('create_pr',{material:'MAT-TAMPERED',plant:'HYD1',quantity:100},400);
      const invalidPlant=await post('create_pr',{material:'MAT-101',plant:'PLANT-TAMPERED',quantity:100},400);
      const pr=await post('create_pr',{material:'MAT-101',plant:'HYD1',quantity:100});
      const afterPr=await flow();
      const invalidVendor=await post('create_po',{source_pr:pr.documentNumber,vendor:'VENDOR-TAMPERED',purchasing_organization:'P100',unit_price:12.5},400);
      const invalidPurchOrg=await post('create_po',{source_pr:pr.documentNumber,vendor:'VEND-1001',purchasing_organization:'PORG-TAMPERED',unit_price:12.5},400);
      const po=await post('create_po',{source_pr:pr.documentNumber,vendor:'VEND-1001',purchasing_organization:'P100',unit_price:12.5});
      const afterPo=await flow();
      const duplicatePo=await post('create_po',{source_pr:pr.documentNumber,vendor:'VEND-1001',purchasing_organization:'P100',unit_price:12.5},400);
      const invalidStorage=await post('post_gr',{source_po:po.documentNumber,storage_location:'SL-TAMPERED',received_quantity:1,posting_date:today,document_date:today,movement_type:'101'},400);
      const gr1=await post('post_gr',{source_po:po.documentNumber,storage_location:'SL01',received_quantity:60,posting_date:today,document_date:today,movement_type:'101'});
      const gr2=await post('post_gr',{source_po:po.documentNumber,storage_location:'SL01',received_quantity:40,posting_date:today,document_date:today,movement_type:'101'});
      const overReceipt=await post('post_gr',{source_po:po.documentNumber,storage_location:'SL01',received_quantity:1,posting_date:today,document_date:today,movement_type:'101'},400);

      const mismatch=await post('post_invoice',{source_po:po.documentNumber,supplier_invoice_number:`INV-MIS-${Date.now()}`,invoice_date:today,posting_date:today,invoice_value:1500});
      const blockedReplacement=await post('post_invoice',{source_po:po.documentNumber,supplier_invoice_number:`INV-TRY-${Date.now()}`,invoice_date:today,posting_date:today,invoice_value:1250},409);
      const reverseMismatch=await post('reverse_invoice',{source_invoice:mismatch.documentNumber});
      const duplicateInvoice=await post('post_invoice',{source_po:po.documentNumber,supplier_invoice_number:mismatch.supplierInvoiceNumber,invoice_date:today,posting_date:today,invoice_value:1250},409);

      const matched=await post('post_invoice',{source_po:po.documentNumber,supplier_invoice_number:`INV-OK-${Date.now()}`,invoice_date:today,posting_date:today,invoice_value:1250});
      const grReverseBlocked=await post('reverse_gr',{source_gr:gr2.documentNumber},409);
      const reverseMatched=await post('reverse_invoice',{source_invoice:matched.documentNumber});
      const afterInvoiceReverse=await flow();
      const reverseGr=await post('reverse_gr',{source_gr:gr2.documentNumber});
      const afterGrReverseFlow=await flow();
      const replacementGr=await post('post_gr',{source_po:po.documentNumber,storage_location:'SL01',received_quantity:40,posting_date:today,document_date:today,movement_type:'101'});
      const finalInvoice=await post('post_invoice',{source_po:po.documentNumber,supplier_invoice_number:`INV-FINAL-${Date.now()}`,invoice_date:today,posting_date:today,invoice_value:1250});
      const finalFlow=await flow();
      const closedInvoiceAttempt=await post('post_invoice',{source_po:po.documentNumber,supplier_invoice_number:`INV-LATE-${Date.now()}`,invoice_date:today,posting_date:today,invoice_value:1250},400);
      return {invalidMaterial,invalidPlant,invalidVendor,invalidPurchOrg,invalidStorage,pr,po,gr1,gr2,duplicatePo,overReceipt,mismatch,blockedReplacement,reverseMismatch,duplicateInvoice,matched,grReverseBlocked,reverseMatched,afterInvoiceReverse,reverseGr,afterGrReverseFlow,replacementGr,finalInvoice,closedInvoiceAttempt,afterPr,afterPo,finalFlow};
    });

    expect(result.invalidMaterial.error).toMatch(/not an active ERP master-data value/i);
    expect(result.invalidPlant.error).toMatch(/not an active ERP master-data value/i);
    expect(result.invalidVendor.error).toMatch(/not an active ERP master-data value/i);
    expect(result.invalidPurchOrg.error).toMatch(/not an active ERP master-data value/i);
    expect(result.invalidStorage.error).toMatch(/not an active ERP master-data value|belongs to plant/i);
    expect(result.pr.documentNumber).toMatch(/^PR-/);expect(result.pr.status).toBe('open');
    expect(result.afterPr.stages.requisition).toEqual(expect.arrayContaining([expect.objectContaining({document_number:result.pr.documentNumber,status:'open'})]));
    expect(result.po.documentNumber).toMatch(/^PO-/);expect(result.po.sourceDocument).toBe(result.pr.documentNumber);expect(result.po.status).toBe('open');
    expect(result.afterPo.stages.requisition).toEqual(expect.arrayContaining([expect.objectContaining({document_number:result.pr.documentNumber,status:'converted'})]));
    expect(result.duplicatePo.error).toMatch(/cannot be converted again/i);
    expect(result.gr1.openQuantity).toBe(40);
    expect(result.gr2.openQuantity).toBe(0);
    expect(result.overReceipt.error).toMatch(/remaining open PO quantity|cannot exceed/i);

    expect(result.mismatch.matchStatus).toBe('mismatch');expect(result.mismatch.status).toBe('blocked');expect(result.mismatch.variance).toBe(250);
    expect(result.blockedReplacement.error).toMatch(/must be reversed before another invoice/i);
    expect(result.reverseMismatch.status).toBe('reversed');
    expect(result.duplicateInvoice.error).toMatch(/already been entered/i);
    expect(result.matched.matchStatus).toBe('matched');expect(result.matched.status).toBe('posted');expect(result.matched.poStatus).toBe('closed');
    expect(result.grReverseBlocked.error).toMatch(/Reverse active invoice/i);
    expect(result.reverseMatched.status).toBe('reversed');
    expect(result.afterInvoiceReverse.stages.purchaseOrders).toEqual(expect.arrayContaining([expect.objectContaining({document_number:result.po.documentNumber,status:'fully_received'})]));
    expect(result.reverseGr.status).toBe('reversed');expect(result.reverseGr.reversalMovementType).toBe('102');expect(result.reverseGr.openQuantity).toBe(40);expect(result.reverseGr.poStatus).toBe('partially_received');
    expect(result.afterGrReverseFlow.stages.goodsReceipts).toEqual(expect.arrayContaining([expect.objectContaining({document_number:result.gr2.documentNumber,status:'reversed'})]));
    expect(result.replacementGr.openQuantity).toBe(0);expect(result.replacementGr.poStatus).toBe('fully_received');
    expect(result.finalInvoice.status).toBe('posted');expect(result.finalInvoice.complete).toBe(true);expect(result.finalInvoice.poStatus).toBe('closed');
    expect(result.finalFlow.stages.purchaseOrders).toEqual(expect.arrayContaining([expect.objectContaining({document_number:result.po.documentNumber,status:'closed'})]));
    expect(result.finalFlow.stages.invoices).toEqual(expect.arrayContaining([expect.objectContaining({document_number:result.mismatch.documentNumber,status:'reversed'}),expect.objectContaining({document_number:result.matched.documentNumber,status:'reversed'}),expect.objectContaining({document_number:result.finalInvoice.documentNumber,status:'posted'})]));
    expect(result.closedInvoiceAttempt.error).toMatch(/already closed/i);

    await page.goto(`/documents/${encodeURIComponent(result.po.documentNumber)}`);
    await expect(page.getByText('End-to-end document flow')).toBeVisible();
    await expect(page.getByRole('link', { name: new RegExp(result.pr.documentNumber) })).toBeVisible();
    await expect(page.getByRole('link', { name: new RegExp(result.gr1.documentNumber) })).toBeVisible();
    await expect(page.getByRole('link', { name: new RegExp(result.gr2.documentNumber) })).toBeVisible();
    await expect(page.getByRole('link', { name: new RegExp(result.mismatch.documentNumber) })).toBeVisible();
    await expect(page.getByRole('link', { name: new RegExp(result.finalInvoice.documentNumber) })).toBeVisible();
    await expect(page.getByRole('heading', { name: result.po.documentNumber })).toBeVisible();
    await expect(page.getByText(/Goods-receipt stock impact/i)).toBeVisible();
    await expect(page.getByText(/current stock/i).first()).toBeVisible();
  });
});
