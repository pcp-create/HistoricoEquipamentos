import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.route("**/api/quotes?*", (r) =>
    r.fulfill({
      json: {
        items: [],
        histories: {},
        products: {},
        recommendations: [],
        warnings: [],
      },
    }),
  );
  await page.route("**/api/tasks", (r) =>
    r.fulfill({
      json:
        r.request().method() === "POST"
          ? { created: 0, completed: 0 }
          : { tasks: [], users: [], email: "test@example.com" },
    }),
  );
});
import { emptyOperating, predict } from "../lib/equipment-management/planning";
test("equipment module restricts access and creates a plan from manual operating data", async ({
  page,
  context,
  request,
}) => {
  expect((await request.get("/api/equipment-management")).status()).toBe(401);
  expect(
    (await request.post("/api/equipment-management", { data: {} })).status(),
  ).toBe(403);
  await context.addCookies([
    { name: "m8-access", value: "test", domain: "localhost", path: "/" },
  ]);
  const equipment = {
    id: "100",
    name: "Compressor GA 90",
    model: "GA90",
    brand: "Atlas Copco",
    serial: "ABC123",
    collected_at: "2026-09-01",
  };
  const detail: any = {
    equipment,
    clients: [{ id: "1", name: "Cliente A" }],
    settings: { document: emptyOperating, version: null },
    plans: [],
    history: [],
    events: [],
  };
  const writes: any[] = [];
  let listReads = 0;
  await page.route("**/api/equipment-management*", async (route) => {
    if (route.request().method() === "POST") {
      const b = route.request().postDataJSON();
      writes.push(b);
      if (b.action === "settings")
        detail.settings = { document: b.document, version: 1 };
      if (b.action === "plan")
        detail.plans = [
          {
            id: "plan",
            version: 1,
            document: b.document,
            forecast: predict(
              { ...b.document, hours: Number(b.document.hours) },
              detail.settings.document,
            ),
          },
        ];
      return route.fulfill({ json: { saved: true } });
    }
    if (new URL(route.request().url()).searchParams.has("id"))
      return route.fulfill({ json: detail });
    listReads++;
    return route.fulfill({
      json: {
        rows: [
          {
            ...equipment,
            clients: detail.clients,
            ownership: "unknown",
            plans: 0,
          },
        ],
        total: 1,
        page: 1,
        pages: 1,
        counts: { equipment: 1, overdue: 0, soon: 0, unplanned: 1 },
        email: "test@example.com",
      },
    });
  });
  await page.goto("/equipamentos");
  await expect(page.getByRole("button", { name: "Gerenciar" })).toBeVisible();
  const beforeFilter = listReads;
  const rental = page.getByRole("button", {
    name: /^Máquinas de Locação \(/,
  });
  await rental.click();
  await expect(rental).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Nenhum equipamento encontrado.")).toBeVisible();
  await page
    .getByRole("button", { name: /^Todos \(/ })
    .first()
    .click();
  await expect(rental).toHaveAttribute("aria-pressed", "false");
  await page.waitForTimeout(400);
  expect(listReads).toBe(beforeFilter);
  await page.getByRole("button", { name: "Gerenciar" }).click();
  await expect(
    page.getByRole("heading", { name: "Compressor GA 90" }),
  ).toBeVisible();
  await page.getByLabel("Horas de operação por dia").fill("24");
  await page.getByLabel("Dias de operação por ano").fill("365");
  await page.getByRole("button", { name: "Salvar operação" }).click();
  await expect(page.getByRole("status")).toContainText("Informações salvas");
  await page.getByRole("button", { name: "Criar plano" }).click();
  await page.getByLabel("Serviço / nome do plano").fill("Preventiva 4000");
  await page.getByLabel("Intervalo em horas", { exact: true }).fill("4000");
  await page.getByLabel("Data da última intervenção").fill("2026-01-01");
  await page.getByLabel("Horímetro na última intervenção").fill("1000");
  await page.getByRole("button", { name: "Salvar plano" }).click();
  await expect(
    page.getByText("Preventiva 4000", { exact: true }),
  ).toBeVisible();
  expect(writes[1].document.lastMeter).toBe("1000");
  await page
    .getByRole("button", { name: "Registrar manutenção de Preventiva 4000" })
    .click();
  await expect(
    page.getByLabel("Horímetro da intervenção", { exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("rental views show a compact photo carousel, popup and separate situation column without refetching equipment", async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: "m8-access", value: "test", domain: "localhost", path: "/" },
  ]);
  let reads = 0,
    photos = 0;
  await page.route("**/api/activity", (r) =>
    r.fulfill({ json: { admin: false } }),
  );
  await page.route("**/api/equipment-management*", (r) => {
    reads++;
    return r.fulfill({
      json: {
        rows: [
          {
            id: "100",
            name: "Compressor teste",
            rental: true,
            clients: [],
            plans: 0,
            rentalStatus: {
              key: "rented",
              label: "Locado",
              order: "123",
              company: 1,
              customer: "Cliente contrato",
              contract: {
                key: "soon",
                label: "Próximo do vencimento",
                start: "2026-09-01",
                end: "2026-09-30",
                duration: 29,
                remaining: 10,
              },
            },
          },
        ],
        email: "test@example.com",
      },
    });
  });
  const png =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6zZsAAAAASUVORK5CYII=";
  await page.route("**/api/products/1/100/images", (r) => {
    photos++;
    return r.fulfill({
      json: {
        images: [
          { key: "a", url: png },
          { key: "b", url: png },
        ],
        unsupported: 0,
      },
    });
  });
  await page.goto("/equipamentos");
  await expect(page.getByRole("button", { name: "Gerenciar" })).toBeVisible();
  expect(photos).toBe(0);
  const initial = reads;
  await page.getByRole("button", { name: /^Máquinas de Locação \(/ }).click();
  await expect(
    page.getByRole("button", { name: "Ampliar foto 1", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Próxima foto", exact: true }).click();
  await page
    .getByRole("button", { name: "Ampliar foto 2", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Fotos de Compressor teste" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Foto anterior ampliada" }).click();
  await expect(
    page.getByAltText("Compressor teste — foto ampliada 1"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Fechar foto ampliada" }).click();
  await page.getByRole("button", { name: /^Locados e Emprestados \(/ }).click();
  await expect(
    page.getByRole("group", {
      name: "Situação do contrato de locação ou empréstimo",
    }),
  ).toBeVisible();
  const typeFilters = page.getByRole("group", {
    name: "Tipo de contrato",
    exact: true,
  });
  const deadlineFilters = page.getByRole("group", {
    name: "Situação do contrato de locação ou empréstimo",
    exact: true,
  });
  await typeFilters
    .getByRole("button", { name: "Emprestados 0", exact: true })
    .click();
  await expect(page.getByText("Nenhum equipamento encontrado.")).toBeVisible();
  await expect(
    deadlineFilters.getByRole("button", { name: "Todos 0", exact: true }),
  ).toBeVisible();
  await typeFilters
    .getByRole("button", { name: "Locados 1", exact: true })
    .click();
  await expect(
    deadlineFilters.getByRole("button", { name: "Todos 1", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Vencido 0", exact: true }).click();
  await expect(page.getByText("Nenhum equipamento encontrado.")).toBeVisible();
  expect(reads).toBe(initial);
});
