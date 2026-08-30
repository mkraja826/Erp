import { test, expect } from '@playwright/test';

test.describe('General ledger foundation',()=>{
  test('posts balanced journals and produces trial balance plus statements',async({page},testInfo)=>{
    test.skip(testInfo.project.name!=='chromium','GL lifecycle certification runs once on desktop.');
    const email=process.env.E2E_LEARNER_EMAIL,password=process.env.E2E_LEARNER_PASSWORD;
    test.skip(!email||!password,'Requires CI learner.');
    await page.goto('/auth');
    await page.getByLabel('Email').fill(email!);
    await page.getByLabel('Password').fill(password!);
    await page.getByRole('button',{name:'Sign in'}).last().click();
    await expect(page).toHaveURL(/\/dashboard$/,{timeout:20000});

    const result=await page.evaluate(async()=>{
      const token=JSON.parse(localStorage.getItem('erp-edu-session')||'{}').access_token;
      if(!token)throw new Error('Missing token');
      const headers={'Content-Type':'application/json',Authorization:`Bearer ${token}`};
      async function post(action:string,data:Record<string,unknown>,expected=200){
        const r=await fetch('/api/general-ledger',{method:'POST',headers,body:JSON.stringify({action,data})});
        const b=await r.json();
        if(r.status!==expected)throw new Error(`${action} ${r.status}: ${JSON.stringify(b)}`);
        return b;
      }
      const period='2099-12',posting='2099-12-15';
      const bad=await post('post_journal',{posting_date:posting,items:[{account:'110000',debit:100},{account:'310000',credit:90}]},409);
      const unknown=await post('post_journal',{posting_date:posting,items:[{account:'999999',debit:100},{account:'310000',credit:100}]},400);
      const journal=await post('post_journal',{posting_date:posting,reference:'Phase 6A certification',items:[{account:'110000',debit:1000,text:'Capital received'},{account:'310000',credit:1000,text:'Owner equity'}]});
      const trial=await post('trial_balance',{fiscal_period:period});
      const statements=await post('financial_statements',{fiscal_period:period});
      return{period,bad,unknown,journal,trial,statements};
    });

    expect(result.bad.error).toMatch(/not balanced/i);
    expect(result.unknown.error).toMatch(/not in the chart of accounts/i);
    expect(result.journal.balanced).toBe(true);
    expect(result.journal.fiscalPeriod).toBe(result.period);
    expect(result.trial.balanced).toBe(true);
    expect(Math.abs(result.trial.totalDebit-result.trial.totalCredit)).toBeLessThan(0.01);
    expect(result.trial.rows).toEqual(expect.arrayContaining([expect.objectContaining({account:'110000'}),expect.objectContaining({account:'310000'})]));
    expect(result.statements.profitAndLoss).toBeTruthy();
    expect(result.statements.balanceSheet).toBeTruthy();
    expect(result.statements.balanceSheet.assets).toBe(1000);
    expect(result.statements.balanceSheet.liabilitiesAndEquity).toBe(1000);
  });
});
