import { test, expect } from "@playwright/test";
const type = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Coleta e análise de vibração",
  code: "vibration",
};
const plan = {
  id: "22222222-2222-4222-8222-222222222222",
  customer_person_id: "1",
  customer_company_id: 1,
  customer: "Cliente Um",
  type_id: type.id,
  type_name: type.name,
  type_code: type.code,
  route_name: "Rota Serra",
  interval_value: 6,
  interval_unit: "months",
  notice_days: 30,
  baseline_date: "2026-01-01",
  first_due: null,
  notes: "Todas as máquinas",
  active: true,
  version: 1,
  equipment_count: 3,
  city: "Lages",
  uf: "SC",
  forecast: { lastDate: "2026-01-01", due: "2026-07-01", status: "overdue" },
};
test("inspection control lists customer fleet and registers an execution without an equipment selection", async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: "m8-refresh", value: "test", domain: "localhost", path: "/" },
  ]);
  let row = { ...plan },
    records: any[] = [],
    saved: any;
  await page.route("**/api/inspections?*", (r) =>
    r.fulfill({
      json: { plans: [row], types: [type], records, quotes: [], report: null },
    }),
  );
  await page.route("**/api/inspections", (r) => {
    saved = r.request().postDataJSON();
    records = [
      {
        id: saved.id,
        collected_on: saved.collectedOn,
        notes: saved.notes,
        service_order: saved.serviceOrder,
      },
    ];
    row = {
      ...row,
      forecast: {
        lastDate: saved.collectedOn,
        due: "2027-04-27",
        status: "scheduled",
      },
    };
    return r.fulfill({ json: { saved: true } });
  });
  await page.goto("/equipamentos/inspecoes");
  await expect(
    page.getByRole("heading", { name: "Controle de Inspeções", exact: true }),
  ).toBeVisible();
  await expect(page.locator("tbody")).toContainText("Rota Serra");
  await expect(page.locator("tbody")).toContainText("Vencida");
  await page.getByRole("button", { name: "Abrir plano", exact: true }).click();
  const detail = page.getByRole("region", {
    name: "Plano de inspeção",
    exact: true,
  });
  await expect(detail).toContainText("3 máquinas do cliente");
  await expect(
    detail.getByRole("link", { name: "Ver tarefas da inspeção" }),
  ).toHaveAttribute("href", "/tarefas?inspection=" + plan.id);
  await detail
    .getByRole("button", { name: "Registrar inspeção realizada" })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Registrar inspeção",
    exact: true,
  });
  await dialog.getByLabel("Data da coleta / inspeção").fill("2026-10-27");
  await dialog.getByLabel("Ordem de serviço").fill("1234");
  await dialog
    .getByLabel("Registro da inspeção")
    .fill("Inspeção de todo o parque de máquinas");
  await dialog
    .getByRole("button", { name: "Salvar inspeção", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  expect(saved).toMatchObject({
    action: "record",
    planId: plan.id,
    collectedOn: "2026-10-27",
    serviceOrder: "1234",
  });
  expect(saved.equipment).toBeUndefined();
  await expect(page.locator("tbody")).toContainText("Em dia");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("report context creates a configurable client plan and links the collection date", async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: "m8-refresh", value: "test", domain: "localhost", path: "/" },
  ]);
  const reportId = "33333333-3333-4333-8333-333333333333";
  let saved: any;
  await page.route("**/api/inspections?*", (r) =>
    r.fulfill({
      json: {
        plans: [],
        types: [type],
        records: [],
        quotes: [],
        report: {
          id: reportId,
          customer_person_id: "1",
          collectedOn: "2026-09-20",
          document: { customer: { name: "Cliente Um" } },
        },
      },
    }),
  );
  await page.route("**/api/inspections", (r) => {
    saved = r.request().postDataJSON();
    return r.fulfill({ json: { saved: true } });
  });
  await page.goto("/equipamentos/inspecoes?report=" + reportId);
  await page
    .getByRole("button", { name: "Criar plano com esta coleta" })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Plano de inspeção",
    exact: true,
  });
  await expect(dialog).toContainText("Cliente Um");
  await expect(
    dialog.getByLabel("Última inspeção", { exact: true }),
  ).toHaveValue("2026-09-20");
  await dialog.getByLabel("Nome da rota").fill("Rota Norte");
  await dialog.getByLabel("Periodicidade", { exact: true }).fill("90");
  await dialog.getByRole("combobox", {name:"Unidade",exact:true}).selectOption("days");
  await dialog
    .getByLabel("Próximo do vencimento: antecedência em dias")
    .fill("15");
  await dialog
    .getByRole("button", { name: "Salvar plano", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  expect(saved).toMatchObject({
    action: "save",
    customer: "1",
    typeId: type.id,
    reportId,
    interval: 90,
    unit: "days",
    noticeDays: 15,
    lastDate: "2026-09-20",
    route: "Rota Norte",
  });
});
