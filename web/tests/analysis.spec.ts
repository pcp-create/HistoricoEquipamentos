import { test, expect } from "@playwright/test";
import {
  parseAnalysis,
  summarizeMaterials,
  type Consumption,
} from "../lib/material-planning";
const rows: Consumption[] = [
  {
    company_id: 1,
    product_id: "123",
    unit_key: "UNIDADE",
    unit: "UNIDADE",
    name: "Filtro de óleo",
    reference: "1622365200",
    quantity: 180,
    orders: 24,
    active_days: 15,
    first_used: "2026-04-01",
    last_used: "2026-09-01",
  },
  {
    company_id: 1,
    product_id: "456",
    unit_key: "UNIDADE",
    unit: "UNIDADE",
    name: "Elemento separador",
    reference: "2901056622",
    quantity: 90,
    orders: 18,
    active_days: 12,
    first_used: "2026-04-03",
    last_used: "2026-09-02",
  },
  {
    company_id: 1,
    product_id: "789",
    unit_key: "LITROS",
    unit: "LITROS",
    name: "Óleo para compressor",
    reference: "Roto Inject",
    quantity: 540,
    orders: 14,
    active_days: 10,
    first_used: "2026-04-01",
    last_used: "2026-09-03",
  },
  {
    company_id: 2,
    product_id: "123",
    unit_key: "UNIDADE",
    unit: "UNIDADE",
    name: "Filtro de óleo",
    reference: "1622365200",
    quantity: 40,
    orders: 4,
    active_days: 4,
    first_used: "2026-04-01",
    last_used: "2026-09-01",
  },
];
test("analysis is protected; charts, unit comparison, min/max parameters and export work", async ({
  page,
  context,
  request,
}) => {
  expect((await request.get("/api/material-analysis")).status()).toBe(401);
  await page.goto("/analise-materiais");
  await expect(page).toHaveURL(/login/);
  await context.addCookies([
    {
      name: "m8-access",
      value: "fixture-only",
      domain: "localhost",
      path: "/",
    },
  ]);
  await page.route("**/api/material-analysis?*", async (route) => {
    const params = new URL(route.request().url()).searchParams;
    if (params.get("export"))
      return route.fulfill({
        contentType: "text/csv",
        body: "Material;Mínimo\nFiltro;14",
      });
    const filters = parseAnalysis(params),
      coverage = [
        {
          company_id: 1,
          eligible: 32,
          complete: 32,
          ignored_items: 0,
          undated: 0,
        },
        {
          company_id: 2,
          eligible: 20,
          complete: 4,
          ignored_items: 0,
          undated: 0,
        },
      ];
    const normalized = rows.map((r) => ({
      ...r,
      quantity: (r.quantity * filters.days) / 180,
    }));
    const { planned, units, topFrequency, topQuantity } = summarizeMaterials(
      normalized,
      coverage,
      filters,
    );
    return route.fulfill({
      json: {
        email: "teste@example.com",
        filters,
        coverage,
        units,
        topFrequency,
        topQuantity,
        rows: planned.map((row) => ({
          ...row,
          current: {
            unit: row.unit,
            sale_price: "100",
            minimum_price: "80",
            stock: "12",
            available: "9",
            stock_value: "1200",
            price_at: new Date().toISOString(),
            stock_at: new Date().toISOString(),
            available_at: new Date().toISOString(),
          },
        })),
        total: planned.length,
        page: 1,
        size: 25,
        summary: {
          materials: planned.length,
          eligible: 52,
          complete: 36,
          estimable: planned.filter((r) => r.minimum !== null).length,
        },
      },
    });
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/analise-materiais");
  await expect(
    page.getByRole("heading", { name: "Consumo e níveis de estoque" }),
  ).toBeVisible();
  await expect(
    page.getByText("Escolha uma unidade nos filtros acima."),
  ).toBeVisible();
  await expect(
    page.getByText("A importação ainda está em andamento."),
  ).toBeVisible();
  await expect(page.locator(".stock-min").first()).toHaveText("14");
  await page.getByLabel("Unidade de medida").selectOption("UNIDADE");
  await page.getByRole("button", { name: "Analisar materiais" }).click();
  await expect(page).toHaveURL(/unit=UNIDADE/);
  await expect(page.getByText("Comparação na unidade UNIDADE.")).toBeVisible();
  await page.getByLabel("Reposição", { exact: true }).fill("14");
  await page.getByRole("button", { name: "Analisar materiais" }).click();
  await expect(page.locator(".stock-min").first()).toHaveText("21");
  await expect(page.locator(".stock-max").first()).toHaveText("51");
  await expect(
    page
      .getByRole("link", { name: "Consultar histórico do material 123" })
      .first(),
  ).toHaveAttribute("href", /productId=123/);
  await page.getByLabel("Ordenar materiais").selectOption("quantity");
  await expect(page).toHaveURL(/sort=quantity/);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar CSV" }).click();
  expect((await download).suggestedFilename()).toBe("analise-materiais.csv");
  await page.screenshot({
    path: "test-results/analysis-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/analysis-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
