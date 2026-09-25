import { test, expect } from "@playwright/test";
import { blankQuote, type QuoteItem } from "../lib/quotes/types";
const item: QuoteItem = {
  key: "p:1:5:UN",
  kind: "material",
  code: "5",
  name: "Filtro de óleo",
  unit: "UN",
  quantity: "1",
  price: "",
  selected: false,
  source: "Histórico · Fabricante · Referência fabricante (Genuína)",
  referencePrice: "120",
  minimumPrice: "100",
  lastPrice: "110",
  referenceAt: "2026-09-11T12:00:00Z",
};
test("quotation routes require login and reject cross-origin writes", async ({
  page,
  request,
}) => {
  await page.goto("/orcamentos");
  await expect(page).toHaveURL(/login/);
  for (const query of [
    "",
    "?lookup=clients&company=1&q=teste",
    "?action=suggestions&company=1",
  ])
    expect((await request.get("/api/quotes" + query)).status()).toBe(401);
  expect(
    (
      await request.post("/api/quotes", {
        headers: { Origin: "https://outro.example" },
        data: blankQuote(),
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.post("/api/quotes", {
        headers: { Origin: "http://localhost:3000" },
        data: blankQuote(),
      })
    ).status(),
  ).toBe(401);
});
test("quote selects equipment, combines suggestions, edits prices, saves and reopens with mobile layout", async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: "m8-access", value: "test", domain: "localhost", path: "/" },
  ]);
  let saved: any = null;
  await page.route("**/api/quotes**", async (route) => {
    const url = new URL(route.request().url()),
      p = url.searchParams;
    if (route.request().method() === "POST") {
      saved = {
        ...route.request().postDataJSON(),
        id: "12345678-1234-1234-1234-123456789012",
        version: 1,
        number: "1",
      };
      return route.fulfill({ json: saved });
    }
    if (p.has("id")) return route.fulfill({ json: saved });
    if (p.get("lookup") === "clients")
      return route.fulfill({
        json: {
          rows: [{ id: "1", name: "Cliente Teste", document: "123" }],
          truncated: false,
        },
      });
    if (p.get("lookup") === "equipment")
      return route.fulfill({
        json: {
          rows: [{ name: "Compressor", model: "GA15", serial: "SN1234" }],
          truncated: false,
        },
      });
    if (p.get("lookup") === "services")
      return route.fulfill({
        json: {
          items: [
            {
              ...item,
              key: "s:1:10",
              code: "10",
              kind: "service",
              name: "Revisão preventiva",
              source: "Base geral · Cadastro M8",
              generalSale: {
                company: "2",
                order: "11000",
                date: "2026-08-20T12:00:00Z",
                quantity: "1",
                unitPrice: "200",
                total: "200",
                customer: "Outro cliente",
              },
              referencePrice: "",
              minimumPrice: "",
              lastPrice: "200",
              unit: "",
            },
          ],
          truncated: false,
        },
      });
    if (p.get("action") === "suggestions")
      return route.fulfill({
        json: {
          items: [
            item,
            {
              ...item,
              key: "p:1:11:UN",
              code: "11",
              name: "Filtro similar",
              lastPrice: "",
              source: "Fabricante · Código de similaridade",
            },
            {
              ...item,
              key: "m:unmapped",
              code: "9999999999",
              name: "Peça sem cadastro",
              unit: "",
              referencePrice: "",
              minimumPrice: "",
              lastPrice: "",
            },
          ],
          histories: {
            [item.key]: {
              count: 2,
              minimum: "100",
              maximum: "110",
              rows: [
                {
                  company: "2",
                  order: "14083",
                  date: "2026-09-01T12:00:00Z",
                  quantity: "2",
                  unitPrice: "110",
                  total: "220",
                },
                {
                  company: "1",
                  order: "13000",
                  date: "2026-08-01T12:00:00Z",
                  quantity: "1",
                  unitPrice: "100",
                  total: "100",
                },
              ],
            },
          },

          recommendations: [
            {
              id: "entry",
              name: "Filtro recomendado pelo fabricante",
              code: "1234567890",
              variant: "GA15",
              interval: "4.000 h",
              interval_original: "4000",
              interval_hours: 4000,
              observation: "Conferir aplicação",
              issues: [],
              itemKeys: [item.key, "p:1:11:UN"],
              products: [
                {
                  company_id: 1,
                  product_id: "5",
                  name: "Filtro de óleo",
                  unit: "UN",
                  reference: "1234567890",
                  similarity: null,
                  fields: ["referenciaFabricante"],
                  match_total: 2,
                },
                {
                  company_id: 2,
                  product_id: "11",
                  name: "Filtro similar",
                  unit: "UN",
                  reference: null,
                  similarity: "1234567890",
                  fields: ["codigoSimilaridade"],
                  match_total: 2,
                },
              ],
            },
            {
              id: "unmapped",
              name: "Peça sem cadastro",
              code: "9999999999",
              variant: "GA15",
              interval: "8.000 h",
              interval_original: "8000",
              interval_hours: 8000,
              observation: "",
              issues: [],
              products: [],
              itemKeys: ["m:unmapped"],
            },
          ],

          variants: [
            {
              id: "v",
              name: "GA15",
              header: ["Conferir série SN1234"],
              issues: [],
            },
          ],
          intervals: [{ value: "h:8000", label: "8.000 h", count: 1 }],
          warnings: ["Confira as condições da revisão."],
        },
      });
    return route.fulfill({
      json: {
        email: "test@example.com",
        rows: saved
          ? [
              {
                id: saved.id,
                number: "1",
                client_name: saved.client,
                equipment: saved.equipment,
                total_cents: "38000",
                updated_at: "2026-09-11",
                updated_by: "test@example.com",
              },
            ]
          : [],
      },
    });
  });
  await page.goto("/orcamentos");
  await expect(
    page.getByRole("combobox", { name: "Empresa", exact: true }),
  ).toHaveCount(0);
  const client = page.getByRole("combobox", { name: "Cliente", exact: true });
  await client.click();
  await expect(
    page.getByRole("option", { name: "Cliente Teste 123" }),
  ).toBeVisible();
  await client.fill("Teste");
  await page.getByRole("option", { name: "Cliente Teste 123" }).click();
  await expect(client).toHaveValue("Cliente Teste");
  const equipment = page.getByRole("combobox", {
    name: "Equipamento",
    exact: true,
  });
  await equipment.click();
  await expect(page.getByRole("option", { name: /Compressor/ })).toBeVisible();
  await equipment.fill("SN1234");
  await expect(page.getByRole("option", { name: /Compressor/ })).toBeVisible();
  await equipment.press("ArrowDown");
  await equipment.press("Enter");
  await expect(equipment).toHaveValue("Compressor");
  await expect(page.getByLabel("Número de série", { exact: true })).toHaveValue(
    "SN1234",
  );
  await page.getByLabel("Tipo de manutenção").fill("Preventiva");
  const material = page
    .locator(".quote-choice")
    .filter({ hasText: "Filtro de óleo" });
  await expect(material).toBeVisible();
  await expect(material.locator(".quote-origin-genuine")).toHaveCSS(
    "color",
    "rgb(37, 99, 235)",
  );
  await expect(material.getByRole("checkbox")).not.toBeChecked();
  await material.getByRole("checkbox").check();
  await expect(
    page.getByRole("button", { name: "Salvar rascunho" }),
  ).toBeEnabled();
  await material.getByRole("button", { name: "Usar venda M8:" }).click();
  await material.getByLabel("Quantidade").fill("2");
  await material.getByLabel("Valor unitário (R$)").fill("90");
  await expect(material.getByText(/abaixo do mínimo/)).toBeVisible();
  await page.locator(".quote-extras > summary").click();
  await page
    .getByRole("button", { name: "Adicionar serviço", exact: true })
    .click();
  const picker = page.getByRole("dialog");
  await picker.getByLabel("Pesquisar no cadastro").fill("Revisão");
  await picker.getByRole("button", { name: "Adicionar", exact: true }).click();
  await picker.getByRole("button", { name: "Fechar" }).click();
  const service = page
    .locator(".quote-choice")
    .filter({ hasText: "Revisão preventiva" });
  await service.getByRole("checkbox").check();
  await expect(service).toContainText("Última venda · base geral");
  await service.getByRole("button", { name: "Usar última venda:" }).click();
  const listFilter = page.getByLabel("Filtrar materiais e serviços");
  for (const query of ["oleo", "OLEO", "ÓLEO", "óleo"]) {
    await listFilter.fill(query);
    await expect(material).toBeVisible();
    await expect(service).toHaveCount(0);
  }
  await listFilter.fill("");
  await expect(service).toBeVisible();
  await page.getByLabel("Tipo de item").selectOption("all");
  await expect(page.getByLabel("Total do orçamento")).toContainText("380,00");
  await page.getByLabel("Intervalo da revisão").selectOption("h:8000");
  const manufacturerToggle = page.getByLabel(
    "Mostrar somente recomendações do fabricante para esta revisão",
  );
  await expect(manufacturerToggle).toHaveCount(0);
  await expect(
    page.getByText("Filtro recomendado pelo fabricante", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Peça sem cadastro", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".quote-revision-group").first()).toContainText(
    "1234567890",
  );
  await expect(service).not.toBeVisible();
  const similar = page
    .locator(".quote-choice")
    .filter({ hasText: "Filtro similar" });
  await expect(similar).toContainText("Sem histórico");
  await expect(similar.getByRole("checkbox")).not.toBeChecked();
  await expect(
    page
      .locator(".quote-revision-group")
      .first()
      .locator(".quote-choice")
      .first(),
  ).toContainText("Genuína");

  await expect(material).toBeVisible();
  await expect(material).toContainText("OS 14083");
  await material.locator(".quote-choice-details > summary").click();
  await expect(material.locator("tbody tr")).toHaveCount(2);
  await expect(material.locator("tbody")).toContainText("220,00");
  await expect(
    material
      .locator("tbody")
      .getByRole("link", { name: "OS 14083", exact: true }),
  ).toHaveAttribute("href", "/historico?view=orders&orderNumber=14083&company=2");
  await expect(
    material
      .locator("tbody")
      .getByRole("link", { name: "OS 14083", exact: true }),
  ).toHaveAttribute("title", "Abrir detalhes da OS");
  await material.locator(".quote-choice-details > summary").click();
  await expect(material.getByLabel("Valor unitário (R$)")).toHaveValue("90");
  await expect(page.getByLabel("Total do orçamento")).toContainText("380,00");
  await page.screenshot({
    path: "test-results/quote-manufacturer-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.screenshot({
    path: "test-results/quote-manufacturer-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.locator(".quote-extras > summary").click();
  await expect(service).toBeVisible();

  await page
    .getByRole("button", { name: "Salvar rascunho", exact: true })
    .click();
  await expect(
    page.getByText("Rascunho salvo.", { exact: true }),
  ).toBeVisible();
  expect(saved.items.filter((i: QuoteItem) => i.selected)).toHaveLength(2);
  expect(saved.items[0].price).toBe("90");
  await page
    .getByRole("button", { name: "Novo orçamento", exact: true })
    .click();
  await page.locator(".quote-draft").first().click();
  await expect(page.getByLabel("Cliente", { exact: true })).toHaveValue(
    "Cliente Teste",
  );
  await expect(page.getByLabel("Total do orçamento")).toContainText("380,00");
  await client.click();
  await client.fill("Outro cliente");
  await client.press("Escape");
  await expect(client).toHaveValue("Cliente Teste");
  await expect(page.getByLabel("Total do orçamento")).toContainText("380,00");
  await client.click();
  await client.fill("Cliente manual");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page
    .getByRole("option", { name: "Usar “Cliente manual” como nome manual" })
    .click();
  await expect(client).toHaveValue("Cliente Teste");
  await expect(equipment).toHaveValue("Compressor");
  await expect(page.getByLabel("Total do orçamento")).toContainText("380,00");
  await page.screenshot({
    path: "test-results/quotes-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.screenshot({
    path: "test-results/quotes-mobile.png",
    fullPage: true,
  });
});

test("manual manufacturer selection works with blank model and serial", async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: "m8-access", value: "test", domain: "localhost", path: "/" },
  ]);
  const queries: URLSearchParams[] = [];
  await page.route("**/api/quotes**", async (route) => {
    const p = new URL(route.request().url()).searchParams;
    if (p.get("action") === "suggestions") {
      queries.push(p);
      return route.fulfill({
        json: {
          items: [],
          warnings: [],
          recommendations: [],
          histories: {},
          variants: [
            { id: "ga", name: "GA15", header: [], issues: [] },
            { id: "gx", name: "GX7", header: [], issues: [] },
          ],
          intervals: p.get("variant")
            ? [{ value: "h:8000", label: "8.000 h", count: 1 }]
            : [],
        },
      });
    }
    return route.fulfill({ json: { rows: [], email: "test@example.com" } });
  });
  await page.goto("/orcamentos");
  await expect(
    page.getByTitle("test@example.com", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Buscar histórico e fabricante" })
    .click();
  const versions = page.getByRole("combobox", { name: "Versão do fabricante" });
  await versions.click();
  await expect(page.getByRole("listbox").getByRole("option")).toHaveCount(3);
  await page.getByRole("option", { name: "GX7", exact: true }).click();
  await expect(
    page.getByLabel("Intervalo da revisão").locator("option"),
  ).toHaveCount(2);
  await page.getByLabel("Intervalo da revisão").selectOption("h:8000");
  await expect.poll(() => queries.at(-1)?.get("interval")).toBe("");
  const requestCount = queries.length;
  await page.getByLabel("Intervalo da revisão").selectOption("");
  await page.waitForTimeout(400);
  expect(queries.length).toBe(requestCount);
  await page
    .getByRole("button", { name: "Minimizar peças da revisão" })
    .click();
  await expect(page.locator("#quote-revision-content")).toBeHidden();
  await page.getByRole("button", { name: "Expandir peças da revisão" }).click();
  await expect(page.locator("#quote-revision-content")).toBeVisible();
  expect(queries.at(-1)?.get("variant")).toBe("gx");
  await expect(page.getByLabel("Modelo", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Número de série", { exact: true })).toHaveValue(
    "",
  );
});

test("material picker searches while typing, paginates and preserves a general sale", async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: "m8-access", value: "test", domain: "localhost", path: "/" },
  ]);
  const requests: URLSearchParams[] = [];
  const added = {
    ...item,
    key: "p:1:99:UN",
    code: "99",
    name: "ÓLEO do cadastro",
    products: [1, 2].map((company_id) => ({
      company_id,
      product_id: "99",
      name: "ÓLEO do cadastro",
      unit: "UN",
      reference: null,
      similarity: null,
      fields: [],
      match_total: 1,
      current: {
        unit: "UN",
        stock: "10",
        available: "7",
        stock_at: "2026-09-11T12:00:00Z",
        available_at: "2026-09-11T12:00:00Z",
        sale_price: null,
        minimum_price: null,
        price_at: null,
        stock_value: null,
      },
    })),
    source: "Base geral · Cadastro M8",
    generalSale: {
      company: "2",
      order: "12345",
      date: "2026-08-01T12:00:00Z",
      quantity: "3",
      unitPrice: "40",
      total: "120",
      customer: "Cliente geral",
    },
  };
  await page.route("**/api/quotes**", async (route) => {
    const p = new URL(route.request().url()).searchParams;
    if (p.get("lookup") === "materials") {
      requests.push(p);
      return route.fulfill({
        json: {
          items: [added],
          truncated: !p.get("q") && p.get("page") === "1",
          page: Number(p.get("page")),
        },
      });
    }
    if (p.get("action") === "suggestions")
      return route.fulfill({
        json: {
          items: [],
          histories: {},
          recommendations: [],
          variants: [],
          intervals: [],
          warnings: [],
        },
      });
    return route.fulfill({ json: { rows: [], email: "test@example.com" } });
  });
  await page.goto("/orcamentos");
  await page.locator(".quote-extras > summary").click();
  await page
    .getByRole("button", { name: "Adicionar material", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByText("ÓLEO do cadastro", { exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Próxima" }).click();
  await expect.poll(() => requests.at(-1)?.get("page")).toBe("2");
  await dialog.getByLabel("Pesquisar no cadastro").fill("oleo");
  await expect.poll(() => requests.at(-1)?.get("q")).toBe("oleo");
  expect(requests.at(-1)?.get("page")).toBe("1");
  await dialog.getByRole("button", { name: "Adicionar", exact: true }).click();
  await expect(
    dialog.getByRole("button", { name: "Já incluído" }),
  ).toBeDisabled();
  await page.screenshot({
    path: "test-results/quote-catalog-picker.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await dialog.getByRole("button", { name: "Fechar" }).click();
  const row = page.locator(".quote-choice");
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("Última venda · base geral");
  await expect(row.locator(".quote-choice-stock")).toContainText("20 UN");
  await expect(row.locator(".quote-choice-stock")).toContainText("14 UN");
  await expect(row.locator(".quote-choice-origin")).toHaveCount(0);
  await row.getByRole("button", { name: "Usar última venda:" }).click();
  await expect(row.getByLabel("Valor unitário (R$)")).toHaveValue("40.00");
  await expect(row.getByText(/Valor abaixo do mínimo M8/)).toHaveCSS(
    "color",
    "rgb(188, 48, 48)",
  );
  await row.locator(".quote-choice-details > summary").click();
  await expect(row).toContainText("Cliente geral");
});

test("incomplete draft saves responsible and notes and reopens without required fields", async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: "m8-access", value: "test", domain: "localhost", path: "/" },
  ]);
  let saved: any;
  await page.route("**/api/quotes**", async (route) => {
    const params = new URL(route.request().url()).searchParams;
    if (route.request().method() === "POST") {
      saved = {
        ...route.request().postDataJSON(),
        id: "12345678-1234-1234-1234-123456789012",
        responsible: "Gabriela",
        version: 1,
        number: "9",
      };
      return route.fulfill({ json: saved });
    }
    if (params.has("id")) return route.fulfill({ json: saved });
    if (params.get("action") === "suggestions")
      return route.fulfill({
        json: {
          items: [],
          warnings: [],
          recommendations: [],
          histories: {},
          variants: [],
          intervals: [],
        },
      });
    return route.fulfill({
      json: {
        rows: saved
          ? [
              {
                id: saved.id,
                number: "9",
                client_name: "",
                equipment: "",
                responsible: saved.responsible,
                total_cents: "0",
              },
            ]
          : [],
        email: "test@example.com",
      },
    });
  });
  await page.goto("/orcamentos");
  await expect(page.getByLabel("Responsável pelo orçamento")).toHaveCount(0);
  await page.getByLabel("Observações do orçamento").fill("Continuar amanhã");
  await page.getByRole("button", { name: "Salvar rascunho" }).click();
  await expect(
    page.getByText("Rascunho salvo.", { exact: true }),
  ).toBeVisible();
  expect(saved.client).toBe("");
  expect(saved.equipment).toBe("");
  expect(saved.serviceType).toBe("");
  expect(saved.responsible).toBe("Gabriela");
  await page.getByRole("button", { name: "Novo orçamento" }).click();
  await expect(page.getByLabel("Responsável pelo orçamento")).toHaveCount(0);
  await page.getByRole("button", { name: /ORÇ-00009/ }).click();
  await expect(page.getByLabel("Responsável pelo orçamento")).toHaveCount(0);
  await expect(page.getByLabel("Observações do orçamento")).toHaveValue(
    "Continuar amanhã",
  );
});

test("other materials use refreshed balances even when draft has an empty product list", async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: "m8-access", value: "test", domain: "localhost", path: "/" },
  ]);
  const saved = {
    ...blankQuote(),
    id: "12345678-1234-1234-1234-123456789012",
    version: 1,
    number: "15",
    items: [
      {
        ...item,
        source: "Histórico",
        products: [],
        selected: true,
        price: "85",
      },
    ],
  };
  const products = [1, 2].map((company_id) => ({
    company_id,
    product_id: "5",
    name: item.name,
    unit: "UN",
    reference: null,
    similarity: null,
    fields: [],
    match_total: 1,
    current: {
      unit: "UN",
      stock: "10",
      available: "6",
      stock_at: null,
      available_at: null,
      stock_value: null,
      sale_price: null,
      minimum_price: null,
      price_at: null,
    },
  }));
  await page.route("**/api/quotes**", (route) => {
    const p = new URL(route.request().url()).searchParams;
    if (p.has("id")) return route.fulfill({ json: saved });
    if (p.get("action") === "suggestions")
      return route.fulfill({
        json: {
          items: [
            { ...item, source: "Histórico", products },
            {
              ...item,
              key: "p:2:5:CX",
              code: "5",
              unit: "CX",
              name: "Mesmo produto em outra lista",
              selected: false,
            },
            {
              ...item,
              key: "p:1:77:UN",
              code: "77",
              name: "Material sem saldo coletado",
              products: [],
            },
            {
              ...item,
              key: "s:1:8",
              kind: "service",
              name: "Serviço teste",
              products: [],
            },
          ],
          histories: {},
          recommendations: [],
          warnings: [],
          variants: [],
          intervals: [],
        },
      });
    return route.fulfill({
      json: {
        rows: [
          {
            id: saved.id,
            number: "15",
            client_name: "Cliente",
            equipment: "Equipamento",
            total_cents: "8500",
          },
        ],
        email: "test@example.com",
      },
    });
  });
  await page.goto("/orcamentos");
  await page.getByRole("button", { name: /ORÇ-00015/ }).click();
  const row = page
    .locator(".quote-extras .quote-choice")
    .filter({ hasText: item.name });
  await expect(row.locator(".quote-choice-stock")).toContainText("20 UN");
  await expect(row.locator(".quote-choice-stock")).toContainText("12 UN");
  await expect(row.getByRole("checkbox")).toBeChecked();
  await expect(row.getByLabel("Valor unitário (R$)")).toHaveValue("85");
  const duplicate = page
    .locator(".quote-choice")
    .filter({ hasText: "Mesmo produto em outra lista" });
  await expect(duplicate).toHaveCount(0);
  await row.getByRole("checkbox").uncheck();
  await expect(row.getByRole("checkbox")).toBeEnabled();
  await row.getByRole("checkbox").check();
  await expect(row.getByRole("checkbox")).toBeChecked();
  await expect(
    page
      .locator(".quote-choice")
      .filter({ hasText: "Material sem saldo coletado" })
      .locator(".quote-choice-stock"),
  ).toContainText("Estoque: A consultar · Disponível: A consultar");
  await expect(
    page
      .locator(".quote-choice")
      .filter({ hasText: "Serviço teste" })
      .locator(".quote-choice-stock"),
  ).toHaveCount(0);
});

test("selected equipment identity survives clearing NC serial and editing model", async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: "m8-access", value: "test", domain: "localhost", path: "/" },
  ]);
  const requests: URLSearchParams[] = [];
  await page.route("**/api/activity", (r) =>
    r.fulfill({ json: { admin: false } }),
  );
  await page.route("**/api/quotes**", (r) => {
    const p = new URL(r.request().url()).searchParams;
    if (p.get("lookup") === "clients")
      return r.fulfill({
        json: { rows: [{ id: "25005", name: "HYDROWHEEL", document: "123" }] },
      });
    if (p.get("lookup") === "equipment")
      return r.fulfill({
        json: {
          rows: [
            {
              equipment_id: "16330",
              name: "504 - W900",
              model: "",
              serial: "NC",
              source: "Histórico da OS",
            },
          ],
        },
      });
    if (p.get("action") === "suggestions") {
      requests.push(p);
      return r.fulfill({
        json: {
          items: [],
          histories: {},
          recommendations: [],
          variants: [],
          intervals: [],
          warnings: [],
        },
      });
    }
    return r.fulfill({ json: { rows: [], email: "test@example.com" } });
  });
  await page.goto("/orcamentos");
  await page.getByRole("combobox", { name: "Cliente", exact: true }).click();
  await page.getByRole("option", { name: /HYDROWHEEL/ }).click();
  await page
    .getByRole("combobox", { name: "Equipamento", exact: true })
    .click();
  await page.getByRole("option", { name: /504 - W900/ }).click();
  await expect.poll(() => requests.at(-1)?.get("equipmentId")).toBe("16330");
  await page.getByLabel("Número de série", { exact: true }).fill("");
  await expect.poll(() => requests.at(-1)?.get("serial")).toBe("");
  expect(requests.at(-1)?.get("equipmentId")).toBe("16330");
  await page.getByLabel("Modelo", { exact: true }).fill("W900");
  await expect.poll(() => requests.at(-1)?.get("model")).toBe("W900");
  expect(requests.at(-1)?.get("equipmentId")).toBe("16330");
  expect(requests.at(-1)?.get("clientId")).toBe("25005");
});

test("saved draft can be deleted after confirmation without deleting on cancel", async ({
  page,
  context,
  request,
}) => {
  expect(
    (
      await request.delete("/api/quotes", {
        headers: { Origin: "https://other.test" },
        data: {},
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.delete("/api/quotes", {
        headers: { Origin: "http://localhost:3000" },
        data: {},
      })
    ).status(),
  ).toBe(401);
  await context.addCookies([
    { name: "m8-access", value: "test", domain: "localhost", path: "/" },
  ]);
  const saved = {
    ...blankQuote(),
    id: "12345678-1234-1234-1234-123456789012",
    version: 2,
    number: "15",
    client: "Cliente teste",
  };
  let deleted = false,
    deleteCalls = 0;
  await page.route("**/api/quotes**", (route) => {
    const p = new URL(route.request().url()).searchParams;
    if (route.request().method() === "DELETE") {
      expect(route.request().postDataJSON()).toEqual({
        id: saved.id,
        version: 2,
      });
      deleted = true;
      deleteCalls++;
      return route.fulfill({ json: { deleted: true } });
    }
    if (p.has("id")) return route.fulfill({ json: saved });
    if (p.get("action") === "suggestions")
      return route.fulfill({
        json: {
          items: [],
          warnings: [],
          intervals: [],
          variants: [],
          recommendations: [],
        },
      });
    return route.fulfill({
      json: {
        rows: deleted
          ? []
          : [
              {
                id: saved.id,
                number: "15",
                client_name: saved.client,
                total_cents: "0",
              },
            ],
        email: "test@example.com",
      },
    });
  });
  await page.goto(`/orcamentos?id=${saved.id}`);
  const button = page.getByRole("button", {
    name: "Excluir rascunho",
    exact: true,
  });
  await expect(button).toBeVisible();
  page.once("dialog", (d) => d.dismiss());
  await button.click();
  expect(deleteCalls).toBe(0);
  await expect(button).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await button.click();
  await expect(page.getByRole("status")).toContainText("Rascunho excluído.");
  await expect(page.getByRole("button", { name: /ORÇ-00015/ })).toHaveCount(0);
  await expect(button).toHaveCount(0);
  expect(deleteCalls).toBe(1);
  await expect(page).toHaveURL(/\/orcamentos$/);
});
