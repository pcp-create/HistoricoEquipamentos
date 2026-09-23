import { test, expect } from "@playwright/test";
test("admin interface shows integration dates and lets an administrator change access", async ({
  page,
  context,
  request,
}) => {
  expect((await request.get("/api/admin")).status()).toBe(401);
  expect((await request.post("/api/admin", { data: {} })).status()).toBe(403);
  await context.addCookies([
    { name: "m8-access", value: "test", domain: "localhost", path: "/" },
  ]);
  await page.route("**/api/activity", (route) =>
    route.fulfill({ json: { admin: true } }),
  );
  const writes: any[] = [];
  await page.route("**/api/admin", (route) => {
    if (route.request().method() === "POST") {
      writes.push(route.request().postDataJSON());
      return route.fulfill({ json: { saved: true } });
    }
    return route.fulfill({
      json: {
        email: "admin@example.com",
        users: [
          {
            email: "user@example.com",
            display_name: "Equipe",
            role: "user",
            enabled: true,
            online: true,
          },
        ],
        events: [],
        orders: [
          {
            company_id: 1,
            inventory_at: "2026-09-16T12:00:00Z",
            detail_at: null,
            pending: 2,
            errors: 0,
          },
        ],
        products: [],
        equipment: [],
        runs: [],
      },
    });
  });
  await page.goto("/administracao");
  await expect(page.getByText("Online", { exact: true })).toBeHidden();
  await page
    .getByRole("button", { name: "Logs de acesso", exact: true })
    .click();
  await expect(page.getByText("Online", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Funcionários e acessos" }),
  ).toBeHidden();
  await page.getByRole("button", { name: "Usuários", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Integração de ordens de serviço" }),
  ).toBeHidden();
  await page.getByRole("button", { name: "Integrações", exact: true }).click();
  await expect(page.getByText("16/09/2026, 09:00:00")).toBeVisible();
  await page.getByRole("button", { name: "Usuários", exact: true }).click();
  await expect(page.getByLabel("Nome completo")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Novo funcionário", exact: true })
    .click();
  await expect(page.getByLabel("Nome completo")).toBeVisible();
  await page.getByRole("button", { name: "Fechar cadastro" }).click();
  await expect(page.getByLabel("Nome completo")).toHaveCount(0);
  await page.getByRole("button", { name: "Editar funcionário" }).click();
  const checkbox = page.getByLabel("Receber por e-mail");
  const bounds = await checkbox.boundingBox();
  expect(bounds?.width).toBeLessThanOrEqual(20);
  const label = await checkbox.locator("..").locator("span").boundingBox();
  expect(
    Math.abs(bounds!.y + bounds!.height / 2 - (label!.y + label!.height / 2)),
  ).toBeLessThan(3);
  await page.getByRole("button", { name: "Editar funcionário" }).click();
  await page.getByLabel("Perfil", { exact: true }).selectOption("admin");
  await page
    .getByLabel("WhatsApp (país + DDD + número)", { exact: true })
    .fill("5547999999999");
  await page.getByLabel("Recebe alerta de preventiva?").check();
  await page.getByLabel("Receber pelo WhatsApp").check();
  await page.getByRole("button", { name: "Salvar funcionário" }).click();
  await expect(page.getByRole("status")).toContainText("Funcionário salvo.");
  expect(writes[0]).toMatchObject({
    email: "user@example.com",
    mode: "update",
    role: "admin",
    enabled: true,
    phone: "5547999999999",
    alert_preventive: true,
    alert_whatsapp: true,
  });
});
test("forbidden admin response never shows management controls", async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: "m8-access", value: "test", domain: "localhost", path: "/" },
  ]);
  await page.route("**/api/activity", (route) =>
    route.fulfill({ json: { admin: false } }),
  );
  await page.route("**/api/admin", (route) =>
    route.fulfill({
      status: 403,
      json: { error: "Acesso exclusivo de administradores." },
    }),
  );
  await page.goto("/administracao");
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Acesso exclusivo de administradores." }),
  ).toHaveText("Acesso exclusivo de administradores.");
  await expect(
    page.getByRole("button", { name: "Salvar funcionário" }),
  ).toHaveCount(0);
});
