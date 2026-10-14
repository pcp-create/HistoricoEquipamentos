import { test, expect } from "@playwright/test";
import { defaultModules } from "../lib/module-access";

test.skip(!process.env.M8_ROLLOUT_TESTS, "Requires dedicated admin/user test sessions with explicitly configured modules.");
for (const admin of [false, true]) test(`${admin ? "admin" : "user"} navigation follows module permissions independently of role`, async ({page,context}) => {
  const modules: string[] = JSON.parse((admin ? process.env.M8_TEST_ADMIN_MODULES : process.env.M8_TEST_USER_MODULES) || JSON.stringify(defaultModules));
  await context.addCookies([{name:"m8-access",value:(admin ? process.env.M8_TEST_ADMIN_TOKEN : process.env.M8_TEST_USER_TOKEN)||"invalid",domain:"localhost",path:"/"}]);
  await page.goto("/");
  for (const [id,label] of [["programacao","Programação de OSs"],["tecnico","Portal Técnico"]]) {
    const link=page.getByRole("link",{name:new RegExp(label)});
    if(modules.includes(id)) await expect(link).toBeVisible();
    else await expect(link).toHaveCount(0);
  }
  for (const [id,path] of [["tecnico","/api/field"],["programacao","/api/service-scheduling"]]) {
    const response=await context.request.get(path);
    expect(response.status()).toBe(modules.includes(id)?200:403);
    if(!modules.includes(id)) {
      expect((await context.request.post(path,{headers:{origin:new URL(page.url()).origin},data:{}})).status()).toBe(403);
      await page.goto(id==="tecnico"?"/tecnico":"/programacao");
      await expect(page).toHaveURL(/\/$/);
    }
  }
});
