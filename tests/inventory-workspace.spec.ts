import { test, expect } from '@playwright/test';

test.describe('Inventory workspace', () => {
  test('shows persisted stock and goods receipt movement history', async ({ page }) => {
    const email=process.env.E2E_LEARNER_EMAIL;
    const password=process.env.E2E_LEARNER_PASSWORD;
    test.skip(!email||!password,'Requires the Erpedu CI learner account.');
    await page.goto('/auth');
    await page.getByLabel('Email').fill(email!);
    await page.getByLabel('Password').fill(password!);
    await page.getByRole('button',{name:'Sign in'}).last().click();
    await expect(page).toHaveURL(/\/dashboard$/, {timeout:20000});

    await page.goto('/inventory');
    await expect(page.getByRole('heading',{name:'Stock overview and movement history.'})).toBeVisible();
    await expect(page.getByText('Persisted balance')).toBeVisible();
    await expect(page.getByText('Movement type 101')).toBeVisible();
    await expect(page.getByRole('columnheader',{name:'Unrestricted stock'})).toBeVisible();
    await expect(page.getByRole('columnheader',{name:'Material document'})).toBeVisible();

    const runtime=await page.evaluate(async()=>{
      const raw=window.localStorage.getItem('erp-edu-session');
      if(!raw) throw new Error('Missing session');
      const session=JSON.parse(raw) as {access_token?:string};
      const response=await fetch('/api/erp-runtime',{headers:{Authorization:`Bearer ${session.access_token}`}});
      return response.json();
    });

    const inventory=runtime.inventory??[];
    if(inventory.length){
      await expect(page.getByText(String(inventory[0].material_code)).first()).toBeVisible();
    }
    const gr=(runtime.documents??[]).find((d:{document_type:string})=>d.document_type==='GR');
    if(gr) await expect(page.getByText(gr.document_number).first()).toBeVisible();
  });
});
