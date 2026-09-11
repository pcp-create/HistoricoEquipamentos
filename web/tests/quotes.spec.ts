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
          items: [item],
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
  await page.getByLabel("Buscar cliente na base").fill("Teste");
  await page.getByRole("button", { name: "Cliente Teste · 123" }).click();
  await expect(page.getByLabel("Cliente *", { exact: true })).toHaveValue(
    "Cliente Teste",
  );
  await expect(
    page.getByLabel("Equipamento do cliente").locator("option"),
  ).toHaveCount(2);
  await page.getByLabel("Equipamento do cliente").selectOption("0");
  await page.getByLabel("Tipo de manutenção *").fill("Preventiva");
  const material = page
    .locator(".quote-item")
    .filter({ hasText: "Filtro de óleo" });
  await expect(material).toBeVisible();
  await expect(material.getByRole("checkbox")).not.toBeChecked();
  await material.getByRole("checkbox").check();
  await expect(
    page.getByRole("button", { name: "Salvar rascunho" }),
  ).toBeDisabled();
  await material.getByRole("button", { name: "Usar venda:" }).click();
  await material.getByLabel("Quantidade").fill("2");
  await material.getByLabel("Valor unitário (R$)").fill("90");
  await expect(material.getByText(/abaixo do mínimo/)).toBeVisible();
  await page.getByLabel("Buscar serviço na base").fill("Revisão");
  await page
    .getByRole("button", { name: "Buscar serviços", exact: true })
    .click();
  const service = page
    .locator(".quote-item")
    .filter({ hasText: "Revisão preventiva" });
  await service.getByRole("checkbox").check();
  await service.getByRole("button", { name: "Usar último:" }).click();
  await page.getByLabel("Tipo de item").selectOption("all");
  await expect(page.getByLabel("Total do orçamento")).toContainText("380,00");
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
  await expect(page.getByLabel("Cliente *", { exact: true })).toHaveValue(
    "Cliente Teste",
  );
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
