import { test, expect } from "@playwright/test";
test("More actions edits non-processed OS, preserves seller and returns to its drawer", async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: "m8-access", value: "test", domain: "localhost", path: "/" },
  ]);
  await page.route("**/api/**", (r) =>
    r.fulfill({ json: { rows: [], tasks: [], users: [] } }),
  );
  await page.route("**/api/activity", (r) =>
    r.fulfill({ json: { admin: false } }),
  );
  await page.route("**/api/service-scheduling?*", (r) =>
    r.fulfill({ json: { schedule: null } }),
  );
  await page.route("**/api/tasks?*", (r) => r.fulfill({ json: { rows: [] } }));
  const rows = [
    {
      company_id: 2,
      id: "800",
      number: "15099",
      client: "Cliente",
      status: "Pendente",
      materials: 1,
    },
    {
      company_id: 2,
      id: "801",
      number: "15100",
      client: "Cliente",
      status: "Processado",
      materials: 0,
    },
  ];
  await page.route("**/api/history?*", (r) =>
    r.fulfill({
      json: new URL(r.request().url()).searchParams.has("overview")
        ? {
            orders: 2,
            materials: 1,
            clients: 1,
            imported: 2,
            statuses: ["Pendente", "Processado"],
          }
        : { rows, total: 2, page: 1, size: 50 },
    }),
  );
  const draft = {
    company: "2",
    type: "1",
    customer: "10",
    equipment: "100",
    serviceType: "",
    origin: "",
    seller: "20",
    technician: "",
    payment: "1",
    expected: "2026-10-23",
    delivery: "2026-10-24",
    situation: "",
    flowStatus: "",
    freight: "",
    notes: "Original",
    internalNotes: "",
    extra: {},
    items: [
      {
        id: "101",
        kind: "material",
        code: "50",
        name: "Filtro",
        quantity: "2",
        price: "10",
      },
    ],
  };
  let saved: any,
    advances = 0;
  await page.route("**/api/service-orders**", (r) => {
    const p = new URL(r.request().url()).searchParams;
    if (r.request().method() === "POST") {
      const b = r.request().postDataJSON();
      if (b.action === "edit-prepare") {
        saved = b;
        return r.fulfill({
          json: {
            id: b.id,
            company: 2,
            m8Id: 800,
            state: "ready",
            nextItem: 0,
            itemCount: 1,
          },
        });
      }
      expect(b.action).toBe("edit-advance");
      advances++;
      return r.fulfill({
        json: {
          id: b.id,
          company: 2,
          m8Id: 800,
          state: "complete",
          nextItem: 1,
          itemCount: 1,
        },
      });
    }
    if (p.has("edit"))
      return r.fulfill({
        json: {
          number: "15099",
          version: "version",
          draft,
          names: { customer: "Cliente", equipment: "Compressor ABC" },
          labels: { seller: "Vendedor atual" },
          missing: ["origemId"],
          opening: "2026-10-01",
        },
      });
    if (p.get("lookup") === "metadata")
      return r.fulfill({
        json: {
          types: [{ id: "1", name: "Corretiva" }],
          registries: [{ kind: "payment-terms", id: "1", name: "À vista" }],
          users: [],
        },
      });
    if (p.get("lookup") === "sellers")
      return r.fulfill({
        json: {
          rows: [
            { id: "21", name: "Novo padrão", default: true },
            { id: "20", name: "Vendedor atual", default: false },
          ],
        },
      });
    return r.fulfill({ json: { rows: [] } });
  });
  await page.route("**/api/orders/2/800", (r) =>
    r.fulfill({
      json: {
        order: {
          company_id: 2,
          id_m8: "800",
          numero_sequencia: 15099,
          status: "Pendente",
          cliente_nome: "Cliente",
        },
        materials: [],
        services: [],
        equipment: [],
        detail_at: "2026-10-22T15:00:00Z",
      },
    }),
  );
  await page.goto("/historico");
  await page
    .getByRole("button", { name: "Ações da OS 15100", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Editar OS", exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Ações da OS 15099", exact: true })
    .click();
  await page.getByRole("link", { name: "Editar OS", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Editar OS 15099" }),
  ).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Empresa", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("combobox", { name: "Vendedor", exact: true }),
  ).toHaveText("Vendedor atual");
  await page
    .getByRole("textbox", { name: "Observações", exact: true })
    .fill("Texto revisado");
  await page.getByRole("button", { name: "Produtos (1)", exact: true }).click();
  await expect(page.getByLabel("Quantidade", { exact: true })).toHaveValue("2");
  await page.getByLabel("Quantidade", { exact: true }).fill("3");
  await page
    .getByRole("button", { name: "Salvar alterações", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("heading", { name: /OS-15099/ })).toBeVisible();
  expect(saved).toMatchObject({
    action: "edit-prepare",
    company: "2",
    order: "800",
    version: "version",
    draft: { seller: "20", notes: "Texto revisado" },
  });
  expect(saved.draft.items[0]).toMatchObject({ id: "101", quantity: "3" });
  expect(advances).toBe(1);
});
