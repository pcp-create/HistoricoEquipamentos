import { test, expect } from "@playwright/test";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6zZsAAAAASUVORK5CYII=",
  "base64",
);
test("photo endpoints require login, including image bytes", async ({
  request,
}) => {
  expect((await request.get("/api/products/1/10/images")).status()).toBe(401);
  expect(
    (
      await request.get("/api/products/1/10/images?image=" + "a".repeat(64))
    ).status(),
  ).toBe(401);
});
test("photos are loaded only on click, support navigation, empty/error states and keyboard dismissal", async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: "m8-access", value: "test-only", domain: "localhost", path: "/" },
  ]);
  await page.route("**/api/manufacturer?*", (route) =>
    route.fulfill({
      json: {
        email: "test@example.com",
        revision: {
          filename: "Test.xls",
          imported_at: new Date().toISOString(),
        },
        variants: [],
        total: 1,
        page: 1,
        consumption: null,
        rows: [
          {
            id: "a",
            variant_name: "GA15",
            row_number: 10,
            description: "Filtro original",
            code_original: "1234567890",
            section: "Peças",
            issues: [],
            match: "review",
            products: [
              {
                company_id: 1,
                product_id: "10",
                name: "Filtro M8",
                fields: ["codigoSimilaridade"],
                similarity: "1234567890",
                reference: "",
                match_total: 1,
              },
            ],
          },
        ],
      },
    }),
  );
  let requests = 0,
    mode = "photos";
  await page.route("**/api/products/1/10/images*", (route) => {
    const u = new URL(route.request().url());
    if (u.searchParams.has("image"))
      return route.fulfill({ contentType: "image/png", body: png });
    requests++;
    if (mode === "error")
      return route.fulfill({
        status: 503,
        json: { error: "Não foi possível carregar as fotos." },
      });
    return route.fulfill({
      json: {
        images:
          mode === "empty"
            ? []
            : ["a", "b"].map((key) => ({
                key,
                url: "/api/products/1/10/images?image=" + key.repeat(64),
              })),
        unsupported: 0,
        collectedAt: new Date().toISOString(),
      },
    });
  });
  await page.goto("/fabricante");
  await page.getByText("Filtro M8", { exact: true }).click();
  await expect(page.getByRole("button", { name: "Ver fotos" })).toBeVisible();
  expect(requests).toBe(0);
  await page.getByRole("button", { name: "Ver fotos" }).click();
  const dialog = page.getByRole("dialog", { name: "Fotos de Filtro M8" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Foto 1 de 2")).toBeVisible();
  expect(requests).toBe(1);
  await dialog.getByRole("button", { name: "Próxima foto" }).click();
  await expect(dialog.getByText("Foto 2 de 2")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/product-photos-mobile.png",
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Ver fotos" })).toBeFocused();
  mode = "empty";
  await page.getByRole("button", { name: "Ver fotos" }).click();
  await expect(dialog.getByText("Produto sem foto cadastrada.")).toBeVisible();
  await dialog.getByRole("button", { name: "Fechar fotos" }).click();
  mode = "error";
  await page.getByRole("button", { name: "Ver fotos" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Não foi possível");
  mode = "photos";
  await dialog.getByRole("button", { name: "Tentar novamente" }).click();
  await expect(dialog.getByText("Foto 1 de 2")).toBeVisible();
});
