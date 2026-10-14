import { test, expect } from "@playwright/test";

test("recovers modules after an unresolved server session and distinguishes lookup failures from denied access", async ({ page, context }) => {
  await context.addCookies([{ name: "m8-access", value: "expired-test-session", domain: "localhost", path: "/" }]);
  let status = 503;
  let modules = ["crm", "tarefas"];
  await page.route("**/api/activity", route => route.fulfill({ status, json: status === 200
    ? { admin: false, displayName: "Teste", modules, cacheScope: "test:user:" + modules.join(",") }
    : { error: "Atividade indisponível." } }));
  await page.goto("/");
  await expect(page.getByText("Não foi possível atualizar as permissões.", { exact: false })).toBeVisible();
  await expect(page.getByText("Nenhum módulo liberado.", { exact: false })).toHaveCount(0);
  status = 200;
  await page.getByRole("button", { name: "Tentar novamente" }).click();
  const crm = page.getByRole("link", { name: /CRM Apoio/ });
  await expect(crm).toBeVisible();
  await expect(page.getByRole("link", { name: /Tarefas Alertas/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Programação de OSs Planejamento/ })).toHaveCount(0);
  // A transient heartbeat failure must preserve the verified permissions.
  status = 503;
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(page.getByRole("button", { name: "Tentar novamente" })).toBeVisible();
  await expect(crm).toBeVisible();
  // A successful lookup with no permissions must still revoke the visible modules.
  status = 200;
  modules = [];
  await page.getByRole("button", { name: "Tentar novamente" }).click();
  await expect(page.getByText("Nenhum módulo liberado. Solicite acesso ao administrador.")).toBeVisible();
  await expect(crm).toHaveCount(0);
});
