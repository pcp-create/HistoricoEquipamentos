import { test, expect } from "@playwright/test";
test("portal organizes tools and preserves history links", async ({ page, context }) => {
  await context.addCookies([{ name: "m8-access", value: "test", domain: "localhost", path: "/" }]);
  await page.route("**/api/activity", route => route.fulfill({ json: { admin: false } }));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Módulos", exact: true })).toBeVisible();
  for (const name of ["Tarefas", "CRM", "Assistência Técnica", "Suprimentos", "Equipamentos"]) await expect(page.getByRole("navigation", { name: "Módulos do sistema" }).getByRole("link", { name: new RegExp(name) })).toBeVisible();
  await expect(page.getByRole("link", { name: "Orçamentos", exact: true })).toHaveCount(0);
  await page.getByRole("navigation", { name: "Módulos do sistema" }).getByRole("link", { name: /CRM/ }).click();
  await expect(page).toHaveURL(/\/modulos\/crm$/);
  await expect(page.getByRole("navigation", { name: "Menus de CRM" }).getByRole("link", { name: "Orçamentos" })).toHaveAttribute("href", "/orcamentos?module=crm");
  await page.getByRole("link", { name: "Todos os módulos" }).click();
  await expect(page.getByRole("heading", { name: "Módulos", exact: true })).toBeVisible();
  await page.goto("/?view=orders&company=1&orderNumber=14083");
  await expect(page).toHaveURL(/\/historico\?.*orderNumber=14083/);
});

test("breadcrumb follows module context on shared screens", async ({ page, context }) => {
  await context.addCookies([{ name: "m8-access", value: "test", domain: "localhost", path: "/" }]);
  await page.route("**/api/activity", route => route.fulfill({ json: { admin: false } }));
  await page.route("**/api/manufacturer?*", route => route.fulfill({ status: 503, json: { error: "Teste" } }));
  await page.goto("/fabricante?module=crm");
  const nav = page.getByRole("navigation", { name: "Navegação principal" });
  await expect(nav.getByRole("link", { name: "CRM", exact: true })).toHaveAttribute("href", "/modulos/crm");
  await expect(nav.locator('[aria-current="page"]')).toHaveText("Catálogo do fabricante");
  await expect(nav.getByText("Análise de materiais")).toHaveCount(0);
  await page.reload();
  await expect(nav.getByRole("link", { name: "CRM", exact: true })).toBeVisible();
  await page.goto("/fabricante?module=assistencia-tecnica");
  await expect(nav.getByRole("link", { name: "Assistência Técnica", exact: true })).toBeVisible();
});

test("history renders CRM before hydration", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  await context.addCookies([{ name: "m8-access", value: "test", domain: "localhost", path: "/" }]);
  const page = await context.newPage();
  await page.goto("/historico?module=crm");
  const nav = page.getByRole("navigation", { name: "Navegação principal" });
  await expect(nav.getByRole("link", { name: "CRM", exact: true })).toBeVisible();
  await expect(nav.getByText("Assistência Técnica", { exact: true })).toHaveCount(0);
  await context.close();
});
