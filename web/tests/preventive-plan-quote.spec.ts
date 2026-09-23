import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
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
import { blankQuote } from "../lib/quotes/types";
test("plan items generate an editable draft and a linked history entry", async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: "m8-access", value: "test", domain: "localhost", path: "/" },
  ]);
  await page.route("**/api/activity", (r) =>
    r.fulfill({ json: { admin: false } }),
  );
  const planId = "12345678-1234-1234-1234-123456789abc",
    quoteId = "22345678-1234-1234-1234-123456789abc";
  const document = {
    name: "Preventiva 2000",
    hours: 2000,
    months: 6,
    lastDate: "2026-01-01",
    lastMeter: 1000,
    lastOrder: "",
    notes: "",
    items: [] as any[],
  };
  const plan = {
    id: planId,
    version: 1,
    document,
    forecast: predict(document, emptyOperating),
  };
  const detail: any = {
    equipment: {
      id: "100",
      name: "Compressor GA90",
      model: "GA90",
      serial: "ABC",
      brand: "Atlas",
    },
    clients: [{ id: "10", name: "Cliente A" }],
    quoteClients: [{ id: "10", name: "Cliente A", priority: 1 }],
    settings: { document: emptyOperating, version: null },
    plans: [plan],
    history: [],
    events: [],
  };
  const material = {
    key: "p:1:900:UN",
    kind: "material",
    code: "900",
    name: "Filtro de teste",
    unit: "UN",
    quantity: "1",
    price: "",
    selected: false,
    source: "Cadastro",
    referencePrice: "25",
    minimumPrice: "",
    lastPrice: "",
    referenceAt: "",
  };
  let draft: any = null;
  await page.route("**/api/equipment-management**", async (r) => {
    const url = new URL(r.request().url());
    if (r.request().method() === "POST") {
      const b = r.request().postDataJSON();
      if (url.pathname.endsWith("/quote")) {
        expect(b.planId).toBe(planId);
        expect(b.clientId).toBe("10");
        draft = {
          ...blankQuote(),
          id: quoteId,
          version: 1,
          number: "99",
          equipmentId: "100",
          equipment: "Compressor GA90",
          model: "GA90",
          serial: "ABC",
          clientId: "10",
          client: "Cliente A",
          serviceType: document.name,
          items: plan.document.items.map((i) => ({
            ...material,
            ...i,
            key: `${i.kind === "material" ? "p" : "s"}:2:${i.code}`,
            selected: true,
            price: "20.00",
          })),
        };
        detail.events = [
          {
            id: "1",
            kind: "plan",
            created_at: "2026-09-23",
            display_name: "Equipe",
            created_by: "test@example.com",
            document: {
              action: "quote",
              planName: document.name,
              quoteId,
              quoteNumber: "99",
              client: "Cliente A",
            },
          },
        ];
        return r.fulfill({ json: { id: quoteId, number: "99" } });
      }
      plan.document = b.document;
      plan.version++;
      return r.fulfill({ json: { saved: true } });
    }
    return r.fulfill({
      json: url.searchParams.has("id")
        ? detail
        : { rows: [], counts: { equipment: 0 }, total: 0, pages: 1, page: 1 },
    });
  });
  const historicMaterial = {
    ...material,
    key: "p:1:902:UN",
    code: "902",
    name: "Correia utilizada",
    unit: "",
  };
  const historicService = {
    ...material,
    key: "s:1:903",
    code: "903",
    kind: "service",
    name: "Mão de obra anterior",
  };
  const history = (date: string) => ({
    count: 2,
    minimum: "20",
    maximum: "25",
    rows: [
      {
        company: "1",
        order: "500",
        orderNumber: "500",
        date,
        quantity: "3",
        unitPrice: "25",
        total: "75",
      },
    ],
  });
  await page.route("**/api/quotes**", (r) => {
    const p = new URL(r.request().url()).searchParams;
    return r.fulfill({
      json: p.has("lookup")
        ? { items: [material], page: 1, truncated: false }
        : p.has("id")
          ? draft
          : p.get("action") === "suggestions"
            ? {
                items: [historicMaterial, historicService, material],
                variants: [],
                warnings: [],
                intervals: [],
                recommendations: [],
                histories: {
                  ...(draft ? { [material.key]: history("2026-09-21") } : {}),
                  [historicMaterial.key]: history("2026-09-01"),
                  [historicService.key]: history("2026-09-20"),
                },
                issues: [],
              }
            : { rows: [], email: "test@example.com" },
    });
  });
  await page.goto(`/equipamentos?equipment=100&plan=${planId}`);
  await expect(page.getByLabel("Serviço / nome do plano")).toHaveValue(
    "Preventiva 2000",
  );
  const historyPanel = page.getByRole("region", {
    name: "Sugestões do histórico da máquina",
  });
  await expect(
    historyPanel.getByText("Mão de obra anterior", { exact: true }),
  ).toBeVisible();
  await expect(
    historyPanel.getByText("Filtro de teste", { exact: true }),
  ).toHaveCount(0);
  await expect(historyPanel.locator("tbody tr").first()).toContainText(
    "Mão de obra anterior",
  );
  await historyPanel
    .locator("tr")
    .filter({ hasText: "Mão de obra anterior" })
    .getByRole("button", { name: "Incluir no plano" })
    .click();
  await expect(
    historyPanel
      .locator("tr")
      .filter({ hasText: "Mão de obra anterior" })
      .getByRole("button", { name: "Já incluído" }),
  ).toBeDisabled();
  await historyPanel.getByLabel("Tipo de item").selectOption("material");
  await expect(
    historyPanel.getByText("Mão de obra anterior", { exact: true }),
  ).toHaveCount(0);
  await historyPanel.getByRole("button", { name: "Incluir no plano" }).click();
  await page
    .getByRole("button", { name: "Adicionar material", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Adicionar", exact: true })
    .click();
  await expect(
    page.getByRole("dialog").getByRole("button", { name: "Já incluído" }),
  ).toBeDisabled();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Fechar" })
    .click();
  await page.getByLabel("Quantidade de Filtro de teste").fill("2.5");
  await page
    .getByLabel("Unidade de Mão de obra anterior", { exact: true })
    .fill("Pacote");
  await page
    .getByLabel("Unidade de Correia utilizada", { exact: true })
    .fill("Kit");
  await expect(
    page.getByLabel("Unidade de Filtro de teste", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Salvar plano", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Informações salvas");
  expect(plan.document.items.find((i: any) => i.code === "900").quantity).toBe(
    "2.5",
  );
  expect(plan.document.items).toHaveLength(3);
  expect(plan.document.items.find((i: any) => i.code === "903").unit).toBe(
    "Pacote",
  );
  expect(plan.document.items.find((i: any) => i.code === "902").unit).toBe(
    "Kit",
  );
  expect(plan.document.items.find((i: any) => i.code === "903").kind).toBe(
    "service",
  );
  await page
    .getByRole("button", { name: "Gerar orçamento", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Salvar rascunho e abrir orçamento" })
    .click();
  await expect(page).toHaveURL(new RegExp(`/orcamentos\\?id=${quoteId}`));
  await expect(page.getByLabel("Cliente", { exact: true })).toHaveValue(
    "Cliente A",
  );
  await expect(
    page.getByText("Filtro de teste", { exact: true }).first(),
  ).toBeVisible();
  const filterRow = page
    .locator(".quote-choice")
    .filter({ hasText: "Filtro de teste" });
  await expect(filterRow).toHaveCount(1);
  await expect(filterRow.getByRole("checkbox")).toBeChecked();
  await expect(
    filterRow.getByRole("link", { name: "OS 500" }).first(),
  ).toBeVisible();
  await expect(filterRow.getByLabel("Valor unitário (R$)")).toHaveValue(
    "20.00",
  );
  await page
    .getByRole("button", { name: "Usar últimas vendas nos itens selecionados" })
    .click();
  await expect(filterRow.getByLabel("Valor unitário (R$)")).toHaveValue(
    "25.00",
  );
  await expect(filterRow.getByLabel("Quantidade")).toHaveValue("2.5");
  page.on("dialog", (d) => d.accept());
  await page.goto(`/equipamentos?equipment=100`);
  await expect(
    page.getByRole("cell", { name: /Orçamento criado/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Abrir ORÇ-00099" }),
  ).toHaveAttribute("href", `/orcamentos?id=${quoteId}`);
});
