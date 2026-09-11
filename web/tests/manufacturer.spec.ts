import { test, expect } from "@playwright/test";
test("manufacturer page and API require authentication", async ({
  page,
  request,
}) => {
  await page.goto("/fabricante");
  await expect(page).toHaveURL(/\/login/);
  expect((await request.get("/api/manufacturer")).status()).toBe(401);
});
test("catalog presents source, similarity links, equipment context and mobile layout", async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: "m8-access", value: "test-only", domain: "localhost", path: "/" },
  ]);
  const requests: string[] = [];
  await page.route("**/api/manufacturer?*", async (route) => {
    requests.push(route.request().url());
    const q = new URL(route.request().url()).searchParams;
    if (q.get("q") === "falha")
      return route.fulfill({
        status: 503,
        json: { error: "Não foi possível consultar o catálogo do fabricante." },
      });
    return route.fulfill({
      json: {
        email: "teste@example.com",
        revision: {
          filename: "Manual de teste.xls",
          imported_at: "2026-09-11T12:00:00Z",
        },
        variants: [
          {
            id: "a",
            name: "GA 15 geração",
            header: ["GA15", "BRP060001 a BRP065117"],
            models: ["GA15"],
            rules: [
              { model: "GA15", serial: "BRP060001 a BRP065117", cell: "D8" },
            ],
            issues: [],
            match: "match",
          },
        ],
        rows:
          q.get("q") === "vazio"
            ? []
            : [
                {
                  id: "item",
                  variant_id: "a",
                  variant_name: "GA 15 geração",
                  row_number: 11,
                  section: "PEÇAS PRINCIPAIS",
                  description: "Correia original",
                  code_original: "0367 0100 55",
                  observation: "Conferir pressão de trabalho",
                  interval_original: "4000",
                  issues: [],
                  match: "match",
                  products: [
                    {
                      company_id: 1,
                      product_id: "10",
                      name: "Correia M8",
                      reference: "",
                      similarity: "0367010055 / 1234567890",
                      fields: ["codigoSimilaridade"],
                      match_total: 1,
                    },
                  ],
                },
              ],
        total: q.get("q") === "vazio" ? 0 : 1,
        page: 1,
        consumption: q.get("serial")
          ? {
              orders: 2,
              imported: 1,
              clients: 2,
              truncated: false,
              rows: [
                {
                  product_id: "10",
                  name: "Correia aplicada",
                  unit: "UN",
                  quantity: "2",
                  orders: 1,
                  last_used: "2026-09-10T12:00:00Z",
                },
              ],
            }
          : null,
      },
    });
  });
  await page.goto("/fabricante?company=1&serial=BRP060001&model=GA15");
  await expect(
    page.getByRole("heading", { name: "Catálogo do fabricante" }),
  ).toBeVisible();
  await expect(page.getByText("0367 0100 55", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Código de similaridade", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/linha 11/)).toBeVisible();
  await expect(page.getByText(/não comprovam consumo exclusivo/)).toBeVisible();
  await expect(page.getByText(/mais de um cliente/)).toBeVisible();
  await page.getByText("Correia M8", { exact: true }).click();
  await expect(
    page.getByText("0367010055 / 1234567890", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", {
      name: "Consultar histórico deste produto nesta série",
    }),
  ).toHaveAttribute("href", /company=1.*exactSerial=BRP060001.*productId=10/);
  await page.screenshot({
    path: "test-results/manufacturer-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/manufacturer-mobile.png",
    fullPage: true,
  });
  await page.getByLabel("Pesquisa global").fill("vazio");
  await page.getByRole("button", { name: "Pesquisar", exact: true }).click();
  await expect(page.getByText(/Nenhuma peça encontrada/)).toBeVisible();
  expect(requests.at(-1)).toContain("q=vazio");
  await page.getByLabel("Pesquisa global").fill("falha");
  await page.getByRole("button", { name: "Pesquisar", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Não foi possível consultar" }),
  ).toContainText("Não foi possível consultar");
});
