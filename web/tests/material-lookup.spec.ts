import { test, expect } from "@playwright/test";
test("material lookup is protected and consults exact code independently of analysis", async ({
  page,
  context,
  request,
}) => {
  expect((await request.get("/api/products/lookup?code=5")).status()).toBe(401);
  await context.addCookies([
    { name: "m8-access", value: "test", domain: "localhost", path: "/" },
  ]);
  await page.route("**/api/material-analysis?*", (route) =>
    route.fulfill({ status: 503, json: { error: "Análise indisponível" } }),
  );
  const codes: string[] = [];
  await page.route("**/api/products/lookup?*", (route) => {
    const code = new URL(route.request().url()).searchParams.get("code")!;
    codes.push(code);
    return route.fulfill({
      json: {
        rows:
          code === "5"
            ? [
                {
                  company_id: 1,
                  last_sale_at: "2026-09-10T12:00:00Z",
                  last_order_id: "17",
                  last_order_number: "14083",
                  product_id: "5",
                  name: "Filtro teste",
                  reference: "ABC123",
                  unit: "UN",
                  average_cost: "30",
                  minimum_price: "40",
                  sale_price: "50",
                  stock: "0",
                  available: null,
                  stock_value: "0",
                  cost_at: null,
                  price_at: null,
                  stock_at: null,
                  available_at: null,
                },
              ]
            : [],
      },
    });
  });
  let photoRequests = 0;
  await page.route("**/api/products/1/5/images", (route) => {
    photoRequests++;
    return route.fulfill({
      json: {
        images: [
          { key: "photo", url: "/test-material-photo.png" },
          { key: "photo2", url: "/test-material-photo.png" },
          { key: "photo3", url: "/test-material-photo.png" },
        ],
        unsupported: 0,
      },
    });
  });
  await page.route("**/test-material-photo.png", (route) =>
    route.fulfill({
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
        "base64",
      ),
    }),
  );
  await page.goto("/analise-materiais");
  const panel = page.getByRole("region", {
    name: "Consulta por código do material",
  });
  await panel.getByLabel("Código do material").fill("5");
  await panel.getByRole("button", { name: "Consultar material" }).click();
  await expect(panel).toContainText("Filtro teste");
  await expect(panel).toContainText("30,00");
  await expect(panel).toContainText("40,00");
  await expect(panel).toContainText("50,00");
  await expect(panel).toContainText("A consultar");
  await expect(panel.getByRole("link", { name: "OS 14083" })).toHaveAttribute(
    "href",
    "/?view=orders&company=1&orderNumber=14083",
  );
  await expect(panel.getByRole("link", { name: "OS 14083" })).toHaveAttribute(
    "target",
    "_blank",
  );
  await expect(panel).toContainText("10/09/2026");
  await expect(panel.locator(".material-collected").first()).toHaveCSS(
    "font-size",
    "10px",
  );
  expect(codes).toEqual(["5"]);
  await expect(
    panel.getByRole("img", { name: "Filtro teste — foto 1", exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByRole("button", { name: "Ver fotos", exact: true }),
  ).toHaveCount(0);
  await expect(
    panel.getByRole("button", { name: "Foto anterior", exact: true }),
  ).toBeDisabled();
  await panel
    .getByRole("button", { name: "Próxima foto", exact: true })
    .click();
  await expect(panel.locator(".material-photo-count")).toHaveText("2–3 / 3");
  await expect(
    panel.getByRole("button", { name: "Próxima foto", exact: true }),
  ).toBeDisabled();
  await panel
    .getByRole("button", { name: "Foto anterior", exact: true })
    .click();
  await expect(panel.locator(".material-photo-count")).toHaveText("1–2 / 3");
  await expect(
    panel.locator('.material-carousel-slide[aria-hidden="false"]'),
  ).toHaveCount(2);
  expect(photoRequests).toBeGreaterThan(0);
  await panel.getByLabel("Código do material").fill("999");
  await panel.getByRole("button", { name: "Consultar material" }).click();
  await expect(panel).toContainText("Nenhum material encontrado");
});
