import { test, expect } from "@playwright/test";
test("administrator can create, edit, search and remove a city assignment", async ({
  page,
  context,
  request,
}) => {
  expect((await request.get("/api/task-territories")).status()).toBe(401);
  expect(
    (await request.post("/api/task-territories", { data: {} })).status(),
  ).toBe(403);
  await context.addCookies([
    { name: "m8-access", value: "test", domain: "localhost", path: "/" },
  ]);
  await page.route("**/api/activity", (r) =>
    r.fulfill({ json: { admin: true } }),
  );
  await page.route("**/api/admin", (r) =>
    r.fulfill({
      json: {
        email: "admin@example.com",
        users: [],
        events: [],
        orders: [],
        products: [],
        equipment: [],
        runs: [],
      },
    }),
  );
  let rules: any[] = [];
  await page.route("**/api/task-territories", (r) => {
    if (r.request().method() === "POST") {
      const b = r.request().postDataJSON();
      if (b.action === "delete") rules = [];
      else
        rules = [
          {
            ...b,
            id: "1",
            version: (b.version || 0) + 1,
            display_name:
              b.assignee === "a@example.com" ? "Pessoa A" : "Pessoa B",
            enabled: true,
          },
        ];
      return r.fulfill({ json: { saved: true } });
    }
    return r.fulfill({
      json: {
        rules,
        users: [
          { email: "a@example.com", display_name: "Pessoa A" },
          { email: "b@example.com", display_name: "Pessoa B" },
        ],
      },
    });
  });
  await page.goto("/administracao");
  await page
    .getByRole("button", { name: "Divisão comercial", exact: true })
    .click();
  await page.getByRole("button", { name: "Adicionar regra" }).click();
  await page.getByLabel("Cidade nova regra", { exact: true }).fill("São José");
  await page
    .getByLabel("Mesorregião nova regra", { exact: true })
    .fill("Grande Florianópolis");
  await page
    .getByLabel("Microrregião nova regra", { exact: true })
    .fill("Florianópolis");
  await page.getByLabel("Vendedor nova regra", { exact: true }).fill("Bruno");
  await page
    .getByLabel("Orçamentista nova regra", { exact: true })
    .selectOption("a@example.com");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(
    page.getByLabel("Orçamentista São José", { exact: true }),
  ).toHaveValue("a@example.com");
  await page.getByLabel("Pesquisar divisão").fill("BRUNO");
  await expect(
    page.getByLabel("Mesorregião São José", { exact: true }),
  ).toHaveValue("Grande Florianópolis");
  await page
    .getByLabel("Orçamentista São José", { exact: true })
    .selectOption("b@example.com");
  await expect(
    page.getByText("Alterações não salvas", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Vendedor São José", { exact: true }).press("Enter");
  await expect(
    page.getByText("Alterações não salvas", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByLabel("Orçamentista São José", { exact: true }),
  ).toHaveValue("b@example.com");
  await page.getByLabel("Pesquisar divisão").fill("SAO JOSE");
  await expect(page.getByLabel("Cidade São José", { exact: true })).toHaveValue(
    "São José",
  );
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Remover regra de São José", exact: true })
    .click();
  await expect(page.getByText("0 regras", { exact: true })).toBeVisible();
});
