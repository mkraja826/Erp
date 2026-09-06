import { test, expect } from "@playwright/test";

function workLabEmail(base:string){const at=base.lastIndexOf("@");return at>0?`${base.slice(0,at)}+worklab${base.slice(at)}`:`${base}+worklab`;}
async function signIn(page:import("@playwright/test").Page){const email=process.env.E2E_LEARNER_EMAIL,password=process.env.E2E_LEARNER_PASSWORD;test.skip(!email||!password,"Requires E2E learner");await page.goto("/auth");await page.getByLabel("Email").fill(workLabEmail(email!));await page.getByLabel("Password").fill(password!);await page.getByRole("button",{name:"Sign in"}).last().click();await expect(page).toHaveURL(/\/dashboard$/,{timeout:20000});}

test("Phase 7B mobile learner navigation stays available across workplace surfaces",async({page},testInfo)=>{
  test.skip(testInfo.project.name!=="mobile-chromium","Mobile navigation is certified on the phone viewport.");
  await signIn(page);
  const nav=page.getByRole("navigation",{name:"Learner navigation"});
  await expect(nav).toBeVisible();
  for(const name of ["Home","Learn","Inbox","Skills","Certify"])await expect(nav.getByRole("link",{name:new RegExp(name,"i")})).toBeVisible();
  await expect(nav.getByRole("link",{name:/Home/i})).toHaveAttribute("aria-current","page");
  await nav.getByRole("link",{name:/Inbox/i}).click();
  await expect(page).toHaveURL(/\/work-lab\/inbox$/);
  await expect(page.getByRole("navigation",{name:"Learner navigation"}).getByRole("link",{name:/Inbox/i})).toHaveAttribute("aria-current","page");
  await page.getByRole("navigation",{name:"Learner navigation"}).getByRole("link",{name:/Certify/i}).click();
  await expect(page).toHaveURL(/\/work-lab\/final-certification$/);
  await expect(page.getByRole("navigation",{name:"Learner navigation"}).getByRole("link",{name:/Certify/i})).toHaveAttribute("aria-current","page");
});

test("Phase 7B does not show learner navigation on public pages",async({page},testInfo)=>{
  test.skip(testInfo.project.name!=="mobile-chromium","Public mobile shell is certified on the phone viewport.");
  await page.goto("/");
  await expect(page.getByRole("navigation",{name:"Learner navigation"})).toHaveCount(0);
  await page.goto("/auth");
  await expect(page.getByRole("navigation",{name:"Learner navigation"})).toHaveCount(0);
});
