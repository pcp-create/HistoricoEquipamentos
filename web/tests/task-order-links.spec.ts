import { test, expect } from "@playwright/test";
test("OS details menu creates a task with the selected OS identifiers", async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: "m8-access", value: "test", domain: "localhost", path: "/" },
  ]);
  await page.route("**/api/activity", (r) => r.fulfill({ json: {} }));
  await page.route("**/api/history**", (r) =>
    r.fulfill({
      json: {
        rows: [
          {
            id: "100",
            number: "42",
            company_id: 2,
            status: "Pendente",
            client: "Cliente B",
            equipment: "Compressor",
            materials: 0,
          },
        ],
        total: 1,
        page: 1,
        pages: 1,
      },
    }),
  );
  await page.route("**/api/tasks/context?**", (r) =>
    r.fulfill({
      json: {
        order: { id: "100", number: "42", company_id: 2 },
        customer: "Cliente B",
        equipment: { id: "8", name: "Compressor" },
        equipmentName: "Compressor",
        equipments: [{ id: "8", name: "Compressor" }],
        users: [],
      },
    }),
  );
  let sent: any;
  await page.route("**/api/tasks", (r) => {
    if (r.request().method() === "GET")
      return r.fulfill({ json: { users: [], tasks: [] } });
    sent = r.request().postDataJSON();
    return r.fulfill({ json: { task: { id: "99" } } });
  });
  await page.route("**/api/tasks?id=99", (r) =>
    r.fulfill({
      json: {
        task: {
          id: "99",
          title: "Acompanhar OS 42",
          origin: "Ordem de Serviço",
          source_key: "manual:x",
          status: "not_started",
          priority: "normal",
          order_id: "100",
          order_company: 2,
          order_number: "42",
        },
        notes: [],
        attachments: [],
        notifications: [],
        users: [],
      },
    }),
  );
  await page.route("**/api/tasks/reminders?*",r=>r.fulfill({json:{reminders:[]}}));
  await page.route("**/api/orders/2/100",r=>r.fulfill({json:{order:{id_m8:100,company_id:2,cliente_nome:"Cliente B"},materials:[],equipment:[]}}));
  await page.goto("/historico");
  await page.getByLabel("Ações da OS 42").click();
  await page.getByRole("button", { name: "Criar tarefa", exact: true }).click();
  const form = page.getByRole("dialog", { name: "Criar tarefa vinculada" });
  await expect(form.getByLabel("Título")).toHaveValue("Acompanhar OS 42");
  await form.getByLabel("Descrição").fill("Acompanhar retorno");
  await form.getByRole("button", { name: "Criar tarefa", exact: true }).click();
  await expect.poll(() => sent?.orderId).toBe("100");
  expect(sent.orderCompany).toBe(2);
  expect(sent.equipmentId).toBe("8");
  await expect(
    page.getByRole("link", { name: "OS 42 · Empresa 2" }),
  ).toBeVisible();
  const before=page.url();
  await page.getByRole("link",{name:"OS 42 · Empresa 2"}).click();
  await expect(page.getByRole("button",{name:"Fechar detalhes",exact:true})).toBeVisible();
  await expect(page.getByRole("heading",{name:/OS-00042/})).toBeVisible();
  expect(page.url()).toBe(before);
  await page.getByRole("button",{name:"Fechar detalhes",exact:true}).click();
  await expect(page.getByRole("link",{name:"OS 42 · Empresa 2"})).toBeVisible();
});
