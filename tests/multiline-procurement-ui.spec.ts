import { test, expect } from '@playwright/test';

async function signIn(page: import('@playwright/test').Page){
  const email=process.env.E2E_LEARNER_EMAIL;const password=process.env.E2E_LEARNER_PASSWORD;
  test.skip(!email||!password,'Requires the Erpedu CI learner account.');
  await page.goto('/auth');await page.getByLabel('Email').fill(email!);await page.getByLabel('Password').fill(password!);await page.getByRole('button',{name:'Sign in'}).last().click();await expect(page).toHaveURL(/\/dashboard$/, {timeout:20000});
}

test.describe('Multi-line procurement workplace UI',()=>{
  test('supports two requisition lines and mobile-safe row editing',async({page},testInfo)=>{
    await signIn(page);await page.goto('/procurement-flow/multiline');
    await expect(page.getByRole('heading',{name:/Process a multi-item purchase cycle/i})).toBeVisible();
    const material10=page.getByLabel('Material line 10');const material20=page.getByLabel('Material line 20');const qty10=page.getByLabel('Quantity line 10');const qty20=page.getByLabel('Quantity line 20');
    await expect(material10).toBeVisible();await expect(material20).toBeVisible();await expect(qty10).toBeVisible();await expect(qty20).toBeVisible();
    const materialOptions=await material10.locator('option').count();test.skip(materialOptions<3,'Requires at least two active material master records.');
    await material10.selectOption({index:1});await material20.selectOption({index:2});await qty10.fill('25');await qty20.fill('15');
    await expect(page.getByRole('button',{name:/Post requisition/i})).toBeDisabled();
    const plant=page.locator('label').filter({hasText:'Plant *'}).locator('select');await plant.selectOption({index:1});
    await expect(page.getByRole('button',{name:/Post requisition/i})).toBeEnabled();
    await page.getByRole('button',{name:'+ Add item'}).click();await expect(page.getByLabel('Material line 30')).toBeVisible();
    if(testInfo.project.name==='mobile-chromium'){
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);expect(overflow).toBeLessThanOrEqual(1);
      for(const control of [material10,qty10,page.getByRole('button',{name:/Post requisition/i})]){const h=await control.evaluate(el=>el.getBoundingClientRect().height);expect(h).toBeGreaterThanOrEqual(44);}
      const table=page.locator('table').first();const contained=await table.evaluate(el=>{const p=el.parentElement;return !!p&&p.clientWidth<=document.documentElement.clientWidth&&p.scrollWidth>=p.clientWidth;});expect(contained).toBeTruthy();
    }
  });
});
