import { test, expect } from "@playwright/test";
test("opening date and time remain fixed and read-only while editing", async ({
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
          openingDate:"2026-10-01",openingTime:"13:00:00",
        },
      });
    if (p.get("lookup") === "metadata")
      return r.fulfill({
        json: {
          types: [{ id: "1", name: "Corretiva",equipment_required:false }],
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
  await page.goto('/OrdemServico/editar?empresa=2&id=800');
  await expect(page.getByRole('heading',{name:'Editar OS 15099'})).toBeVisible();
  await expect(page.getByLabel('Data Abertura')).toHaveValue('2026-10-01');
  await expect(page.getByLabel('Hora Abertura')).toHaveValue('13:00:00');
  await expect(page.getByLabel('Data Abertura')).toHaveAttribute('readonly','');
  await expect(page.getByLabel('Hora Abertura')).toHaveAttribute('readonly','');
  await page.clock.setFixedTime(new Date('2026-11-11T19:00:00Z'));
  await expect(page.getByLabel('Hora Abertura')).toHaveValue('13:00:00');
  await page.getByRole('button',{name:'Sem equipamento',exact:true}).click();
  await expect(page.getByRole('combobox',{name:'Equipamento',exact:true})).toHaveValue('');
  await page.getByRole('button',{name:'Produtos (1)',exact:true}).click();
  await expect(page.getByLabel('Quantidade',{exact:true})).toHaveAttribute('readonly','');
  await expect(page.getByLabel('Valor unitário',{exact:true})).toHaveAttribute('readonly','');
  await expect(page.getByLabel('Quantidade',{exact:true})).toHaveValue('2');
});
