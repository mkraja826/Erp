import { test, expect } from '@playwright/test';

test.describe('Procurement release strategy', () => {
  test('blocks conversion and receipt until PR and PO are released by the required roles', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Approval lifecycle is API-certified on desktop; inbox remains responsive markup.');
    test.setTimeout(90000);
    const email=process.env.E2E_LEARNER_EMAIL;const password=process.env.E2E_LEARNER_PASSWORD;test.skip(!email||!password,'Requires CI learner.');
    await page.goto('/auth');await page.getByLabel('Email').fill(email!);await page.getByLabel('Password').fill(password!);await page.getByRole('button',{name:'Sign in'}).last().click();await expect(page).toHaveURL(/\/dashboard$/,{timeout:20000});
    const result=await page.evaluate(async()=>{
      const session=JSON.parse(localStorage.getItem('erp-edu-session')||'{}');const token=session.access_token;if(!token)throw new Error('Missing token');const headers={'Content-Type':'application/json',Authorization:`Bearer ${token}`};
      async function post(path:string,action:string,data:Record<string,unknown>,expected=200){const r=await fetch(path,{method:'POST',headers,body:JSON.stringify({action,data})});const b=await r.json();if(r.status!==expected)throw new Error(`${action} returned ${r.status}: ${JSON.stringify(b)}`);return b;}
      const runtime=await (await fetch('/api/erp-runtime',{headers:{Authorization:headers.Authorization}})).json();
      const materials=(runtime.masterData??[]).filter((x:Record<string,unknown>)=>x.entity_type==='material').slice(0,2).map((x:Record<string,unknown>)=>String(x.code));if(materials.length<2)throw new Error('Need two active materials');
      const plant=String((runtime.masterData??[]).find((x:Record<string,unknown>)=>x.entity_type==='plant')?.code??'');const vendor=String((runtime.masterData??[]).find((x:Record<string,unknown>)=>x.entity_type==='vendor')?.code??'');const porg=String((runtime.masterData??[]).find((x:Record<string,unknown>)=>x.entity_type==='purchasing_organization')?.code??'');const storage=String((runtime.masterData??[]).find((x:Record<string,unknown>)=>x.entity_type==='storage_location')?.code??'');
      const pr=await post('/api/procurement-flow/controlled','create_pr',{plant,items:[{line_number:10,material:materials[0],quantity:2},{line_number:20,material:materials[1],quantity:1}]});
      const poBlocked=await post('/api/procurement-flow/controlled','create_po',{source_pr:pr.documentNumber,vendor,purchasing_organization:porg,unit_prices:{'10':10,'20':20}},409);
      const prWrongRole=await post('/api/procurement-flow/approvals','approve',{document_number:pr.documentNumber,acting_role:'purchasing_manager'},409);
      const prSubmit=await post('/api/procurement-flow/approvals','submit',{document_number:pr.documentNumber,acting_role:'requester'});
      const prForbidden=await post('/api/procurement-flow/approvals','approve',{document_number:pr.documentNumber,acting_role:'purchasing_manager'},403);
      const prRelease=await post('/api/procurement-flow/approvals','approve',{document_number:pr.documentNumber,acting_role:'department_manager'});
      const po=await post('/api/procurement-flow/controlled','create_po',{source_pr:pr.documentNumber,vendor,purchasing_organization:porg,unit_prices:{'10':10,'20':20}});
      const today=new Date().toISOString().slice(0,10);
      const grBlocked=await post('/api/procurement-flow/controlled','post_gr',{source_po:po.documentNumber,posting_date:today,document_date:today,movement_type:'101',items:[{line_number:10,received_quantity:2,storage_location:storage},{line_number:20,received_quantity:1,storage_location:storage}]},409);
      const poSubmit=await post('/api/procurement-flow/approvals','submit',{document_number:po.documentNumber,acting_role:'buyer'});
      const poRelease=await post('/api/procurement-flow/approvals','approve',{document_number:po.documentNumber,acting_role:'purchasing_manager'});
      const gr=await post('/api/procurement-flow/controlled','post_gr',{source_po:po.documentNumber,posting_date:today,document_date:today,movement_type:'101',items:[{line_number:10,received_quantity:2,storage_location:storage},{line_number:20,received_quantity:1,storage_location:storage}]});
      return {poBlocked,prWrongRole,prSubmit,prForbidden,prRelease,grBlocked,poSubmit,poRelease,gr};
    });
    expect(result.poBlocked.error).toMatch(/must be released/i);expect(result.prWrongRole.error).toMatch(/pending approval/i);expect(result.prSubmit.releaseStatus).toBe('pending_approval');expect(result.prForbidden.error).toMatch(/department_manager/i);expect(result.prRelease.releaseStatus).toBe('released');expect(result.grBlocked.error).toMatch(/must be released/i);expect(result.poSubmit.releaseStatus).toBe('pending_approval');expect(result.poRelease.releaseStatus).toBe('released');expect(result.gr.status).toBe('posted');
  });
});
