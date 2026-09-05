import { test, expect } from "@playwright/test";

async function signIn(page:import("@playwright/test").Page){const email=process.env.E2E_LEARNER_EMAIL,password=process.env.E2E_LEARNER_PASSWORD;test.skip(!email||!password,"Requires E2E learner");await page.goto("/auth");await page.getByLabel("Email").fill(email!);await page.getByLabel("Password").fill(password!);await page.getByRole("button",{name:"Sign in"}).last().click();await expect(page).toHaveURL(/\/dashboard$/, {timeout:20000});}

test("Phase 7A dashboard exposes the full learning-to-workplace path",async({page})=>{await signIn(page);await expect(page.getByRole("heading",{name:/Learn → Practice → Prove workplace readiness/i})).toBeVisible();for(const label of ["Foundations","SAP MM","Work Lab","Competency","Manager review","Certification"])await expect(page.getByText(label,{exact:true}).first()).toBeVisible();await expect(page.getByText(/Next best action/i)).toBeVisible();});
