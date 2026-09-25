import { test, expect } from "@playwright/test";
test("task settings show fixed commercial assignment and save origin owner", async ({
  page,
  context,
  request,
}) => {
  expect((await request.get("/api/task-settings")).status()).toBe(401);
  expect(
    (await request.post("/api/task-settings", { data: {} })).status(),
  ).toBe(403);
  await context.addCookies([
    { name: "m8-access", value: "test", domain: "localhost", path: "/" },
  ]);
  await page.route("**/api/activity", (r) =>
    r.fulfill({ json: { admin: true } }),
  );
  await page.route("**/api/tasks", (r) =>
    r.fulfill({ json: { tasks: [], users: [] } }),
  );
  await page.route("**/api/task-territories", (r) =>
    r.fulfill({ json: { rules: [
          {origin:"Preventiva de Equipamento Locado",version:1},
          {origin:"Preventiva de Equipamento Emprestado",version:1},], users: [] } }),
  );
  let assignee: string | null = null,
    version = 1;
  await page.route("**/api/task-settings", (r) => {
    if (r.request().method() === "POST") {
      const b = r.request().postDataJSON();
      assignee = b.assignee;
      version++;
      return r.fulfill({ json: { saved: true } });
    }
    return r.fulfill({
      json: {
        canEdit: true,
        rules: [
          {origin:"Preventiva de Equipamento Locado",version:1},
          {origin:"Preventiva de Equipamento Emprestado",version:1},
          { origin: "Máquina de Locação", assignee, version, enabled: true },
        ],
        users: [{ email: "sara@example.com", display_name: "Sara" }],
      },
    });
  });
  await page.goto("/tarefas");
  await page
    .getByRole("button", { name: "Configurações de Tarefas", exact: true })
    .click();
  await expect(
    page.getByText("Conforme Divisão Comercial", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Divisão comercial por cidade e UF" }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Responsável por Máquina de Locação" })
    .selectOption("sara@example.com");
  for (const origin of ["Preventiva de Equipamento Locado", "Preventiva de Equipamento Emprestado"]) {
    const row = page.getByRole("row").filter({has:page.getByRole("cell", {name:origin, exact:true})});
    await expect(row.getByRole("combobox")).toBeDisabled();
    await expect(row.getByRole("button", {name:"Salvar atribuição"})).toBeDisabled();
  }
  await page.getByRole("row").filter({has:page.getByRole("cell", {name:"Máquina de Locação",exact:true})}).getByRole("button", { name: "Salvar atribuição" }).click();
  await expect(page.getByRole("status")).toContainText("Regra salva");
  expect(assignee).toBe("sara@example.com");
  await page
    .getByRole("button", { name: "Voltar às tarefas", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Minhas tarefas", exact: true }),
  ).toBeVisible();
});
