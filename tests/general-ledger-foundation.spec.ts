import { test, expect } from "@playwright/test";

const email=process.env.E2E_CONFIRMED_EMAIL!,password=process.env.E2E_CONFIRMED_PASSWORD!;
async function token(request:any){const url=process.env.NEXT_PUBLIC_SUPABASE_URL!,key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;const r=await request.post(`${url}/auth/v1/token?grant_type=password`,{headers:{apikey:key,"Content-Type":"application/json"},data:{email,password}});expect(r.ok()).toBeTruthy();return (await r.json()).access_token as string;}
async function gl(request:any,t:string,action:string,data:Record<string,unknown>={}){return request.post("/api/general-ledger",{headers:{Authorization:`Bearer ${t}`},data:{action,data}});}
test("Phase 6A posts balanced journals and produces trial balance plus statements",async({request})=>{const t=await token(request),period=new Date().toISOString().slice(0,7),posting=`${period}-15`;
 const bad=await gl(request,t,"post_journal",{posting_date:posting,items:[{account:"110000",debit:100},{account:"310000",credit:90}]});expect(bad.status()).toBe(409);
 const unknown=await gl(request,t,"post_journal",{posting_date:posting,items:[{account:"999999",debit:100},{account:"310000",credit:100}]});expect(unknown.status()).toBe(400);
 const posted=await gl(request,t,"post_journal",{posting_date:posting,reference:"Phase 6A certification",items:[{account:"110000",debit:1000,text:"Capital received"},{account:"310000",credit:1000,text:"Owner equity"}]});expect(posted.ok()).toBeTruthy();const journal=await posted.json();expect(journal.balanced).toBe(true);expect(journal.fiscalPeriod).toBe(period);
 const tb=await gl(request,t,"trial_balance",{fiscal_period:period});expect(tb.ok()).toBeTruthy();const trial=await tb.json();expect(trial.balanced).toBe(true);expect(Math.abs(trial.totalDebit-trial.totalCredit)).toBeLessThan(0.01);expect(trial.rows.some((x:any)=>x.account==="110000")).toBe(true);expect(trial.rows.some((x:any)=>x.account==="310000")).toBe(true);
 const fs=await gl(request,t,"financial_statements",{fiscal_period:period});expect(fs.ok()).toBeTruthy();const statements=await fs.json();expect(statements.profitAndLoss).toBeTruthy();expect(statements.balanceSheet).toBeTruthy();expect(statements.balanceSheet.assets).toBeGreaterThanOrEqual(1000);expect(Math.abs(statements.balanceSheet.assets-statements.balanceSheet.liabilitiesAndEquity)).toBeLessThan(0.01);
});
