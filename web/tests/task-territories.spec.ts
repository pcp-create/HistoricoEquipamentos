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
            version: 1,
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
  await page.getByRole("button", { name: "Nova regra" }).click();
  await page.getByLabel("Cidade", { exact: true }).fill("São José");
  await page.getByLabel("Mesorregião", { exact: true }).fill("Grande Florianópolis");
  await page.getByLabel("Microrregião", { exact: true }).fill("Florianópolis");
  await page.getByLabel("Vendedor", { exact: true }).fill("Bruno");
  await page
    .getByRole("combobox", { name: "Orçamentista", exact: true })
    .selectOption("a@example.com");
  await page.getByRole("button", { name: "Salvar regra" }).click();
  await expect(
    page.getByRole("cell", { name: "Pessoa A", exact: true }),
  ).toBeVisible();
  for (const name of ["Grande Florianópolis", "Florianópolis", "Bruno"]) await expect(page.getByRole("cell", {name, exact:true})).toBeVisible();
  await page.getByLabel("Pesquisar divisão").fill("BRUNO");
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await expect(page.getByLabel("Mesorregião", { exact:true })).toHaveValue("Grande Florianópolis");
  await page
    .getByRole("combobox", { name: "Orçamentista", exact: true })
    .selectOption("b@example.com");
  await page.getByRole("button", { name: "Salvar regra" }).click();
  await expect(
    page.getByRole("cell", { name: "Pessoa B", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Pesquisar divisão").fill("SAO JOSE");
  await expect(
    page.getByRole("cell", { name: "São José", exact: true }),
  ).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Remover", exact: true }).click();
  await expect(page.getByText("0 regras", { exact: true })).toBeVisible();
});
