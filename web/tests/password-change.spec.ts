import { test, expect } from "@playwright/test";

test("mandatory password form confirms the new password and returns to login after saving", async ({page,context})=>{
  await context.addCookies([{name:"m8-access",value:"invalid-test-session",domain:"localhost",path:"/"}]);
  await page.setViewportSize({width:390,height:844});
  const writes: any[]=[];
  await page.route("**/api/session/password",async route=>{
    writes.push(route.request().postDataJSON());
    await route.fulfill({json:{saved:true}});
  });
  await page.goto("/trocar-senha");
  await expect(page.getByRole("dialog",{name:"Cadastre uma nova senha"})).toBeVisible();
  await page.getByLabel("Senha atual",{exact:true}).fill("123456");
  await page.getByLabel("Nova senha",{exact:true}).fill("abcdef");
  await page.getByLabel("Confirmar nova senha",{exact:true}).fill("abcdeg");
  await page.getByRole("button",{name:"Salvar nova senha"}).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toHaveText("As senhas não coincidem.");
  expect(writes).toHaveLength(0);
  await page.getByLabel("Confirmar nova senha",{exact:true}).fill("abcdef");
  await page.getByRole("button",{name:"Salvar nova senha"}).click();
  await expect(page).toHaveURL(/\/login\?passwordChanged=1$/);
  await expect(page.getByRole("status")).toHaveText("Senha alterada. Entre com sua nova senha.");
  expect(writes).toEqual([{currentPassword:"123456",password:"abcdef",confirmation:"abcdef"}]);
});
