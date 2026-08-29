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
      const headers = {'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`};
      async function runtime(){const response=await fetch('/api/erp-runtime',{headers:{Authorization:headers.Authorization}});const body=await response.json();if(!response.ok)throw new Error(`Runtime read failed: ${JSON.stringify(body)}`);return body;}
      async function flow(){const response=await fetch('/api/procurement-flow',{headers:{Authorization:headers.Authorization}});const body=await response.json();if(!response.ok)throw new Error(`Flow read failed: ${JSON.stringify(body)}`);return body;}
      async function post(action:string,data:Record<string,unknown>,expectedStatus=200){const response=await fetch('/api/procurement-flow',{method:'POST',headers,body:JSON.stringify({action,data})});const body=await response.json();if(response.status!==expectedStatus)throw new Error(`${action} returned ${response.status}, expected ${expectedStatus}: ${JSON.stringify(body)}`);return body;}
      const today=new Date().toISOString().slice(0,10);
      const before=await runtime();
      const baseline=Number((before.inventory??[]).find((row:Record<string,unknown>)=>row.material_code==='MAT-101'&&row.plant_code==='HYD1'&&row.storage_location_code==='SL01')?.quantity??0);
      const pr=await post('create_pr',{material:'MAT-101',plant:'HYD1',quantity:100});
      const afterPr=await flow();
      const po=await post('create_po',{source_pr:pr.documentNumber,vendor:'VEND-1001',purchasing_organization:'P100',unit_price:12.5});
      const afterPo=await flow();
      const duplicatePo=await post('create_po',{source_pr:pr.documentNumber,vendor:'VEND-1001',purchasing_organization:'P100',unit_price:12.5},400);
      const gr1=await post('post_gr',{source_po:po.documentNumber,storage_location:'SL01',received_quantity:60,posting_date:today,document_date:today,movement_type:'101'});
      const afterFirstReceiptFlow=await flow();const afterFirstReceipt=await runtime();
      const firstBalance=Number((afterFirstReceipt.inventory??[]).find((row:Record<string,unknown>)=>row.material_code==='MAT-101'&&row.plant_code==='HYD1'&&row.storage_location_code==='SL01')?.quantity??0);
      const gr2=await post('post_gr',{source_po:po.documentNumber,storage_location:'SL01',received_quantity:40,posting_date:today,document_date:today,movement_type:'101'});
      const afterSecondReceiptFlow=await flow();const afterSecondReceipt=await runtime();
      const secondBalance=Number((afterSecondReceipt.inventory??[]).find((row:Record<string,unknown>)=>row.material_code==='MAT-101'&&row.plant_code==='HYD1'&&row.storage_location_code==='SL01')?.quantity??0);
      const overReceipt=await post('post_gr',{source_po:po.documentNumber,storage_location:'SL01',received_quantity:1,posting_date:today,document_date:today,movement_type:'101'},400);
      const mismatch=await post('post_invoice',{source_po:po.documentNumber,supplier_invoice_number:`INV-MIS-${Date.now()}`,invoice_date:today,posting_date:today,invoice_value:1500});
      const duplicateInvoice=await post('post_invoice',{source_po:po.documentNumber,supplier_invoice_number:mismatch.supplierInvoiceNumber,invoice_date:today,posting_date:today,invoice_value:1500},409);
      const matched=await post('post_invoice',{source_po:po.documentNumber,supplier_invoice_number:`INV-OK-${Date.now()}`,invoice_date:today,posting_date:today,invoice_value:1250});
      const finalFlow=await flow();
      const closedInvoiceAttempt=await post('post_invoice',{source_po:po.documentNumber,supplier_invoice_number:`INV-LATE-${Date.now()}`,invoice_date:today,posting_date:today,invoice_value:1250},400);
      return {baseline,firstBalance,secondBalance,pr,po,gr1,gr2,duplicatePo,overReceipt,mismatch,duplicateInvoice,matched,closedInvoiceAttempt,afterPr,afterPo,afterFirstReceiptFlow,afterSecondReceiptFlow,finalFlow};
    });

    expect(result.pr.documentNumber).toMatch(/^PR-/);expect(result.pr.status).toBe('open');
    expect(result.afterPr.stages.requisition).toEqual(expect.arrayContaining([expect.objectContaining({document_number:result.pr.documentNumber,status:'open'})]));
    expect(result.po.documentNumber).toMatch(/^PO-/);expect(result.po.sourceDocument).toBe(result.pr.documentNumber);expect(result.po.status).toBe('open');
    expect(result.afterPo.stages.requisition).toEqual(expect.arrayContaining([expect.objectContaining({document_number:result.pr.documentNumber,status:'converted'})]));
    expect(result.afterPo.stages.purchaseOrders).toEqual(expect.arrayContaining([expect.objectContaining({document_number:result.po.documentNumber,status:'open'})]));
    expect(result.duplicatePo.error).toMatch(/cannot be converted again/i);
    expect(result.gr1.documentNumber).toMatch(/^GR-/);expect(result.gr1.openQuantity).toBe(40);expect(result.gr1.poStatus).toBe('partially_received');expect(result.firstBalance).toBe(result.baseline+60);
    expect(result.gr2.documentNumber).toMatch(/^GR-/);expect(result.gr2.openQuantity).toBe(0);expect(result.gr2.poStatus).toBe('fully_received');expect(result.secondBalance).toBe(result.baseline+100);
    expect(result.overReceipt.error).toMatch(/remaining open PO quantity|cannot exceed/i);
    expect(result.mismatch.matchStatus).toBe('mismatch');expect(result.mismatch.status).toBe('blocked');expect(result.mismatch.expectedValue).toBe(1250);expect(result.mismatch.poValue).toBe(1250);expect(result.mismatch.receivedValue).toBe(1250);expect(result.mismatch.variance).toBe(250);expect(result.mismatch.blockReason).toMatch(/variance/i);
    expect(result.duplicateInvoice.error).toMatch(/already been entered/i);
    expect(result.matched.matchStatus).toBe('matched');expect(result.matched.status).toBe('posted');expect(result.matched.expectedValue).toBe(1250);expect(result.matched.variance).toBe(0);expect(result.matched.complete).toBe(true);expect(result.matched.poStatus).toBe('closed');
    expect(result.finalFlow.stages.purchaseOrders).toEqual(expect.arrayContaining([expect.objectContaining({document_number:result.po.documentNumber,status:'closed'})]));
    expect(result.finalFlow.stages.invoices).toEqual(expect.arrayContaining([expect.objectContaining({document_number:result.mismatch.documentNumber,status:'blocked'}),expect.objectContaining({document_number:result.matched.documentNumber,status:'posted'})]));
    expect(result.closedInvoiceAttempt.error).toMatch(/already closed/i);
  });
});
