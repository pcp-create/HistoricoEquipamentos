import { test, expect } from "@playwright/test";

test("brand selection scopes model suggestions, clears dependent filters and persists in URL", async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: "m8-access", value: "test", domain: "localhost", path: "/" },
  ]);
  await page.route("**/api/activity", (r) =>
    r.fulfill({ json: { admin: true } }),
  );
  const brands = [
    { name: "Atlas Copco", models: ["GA15"] },
    { name: "Metalplan", models: ["TPF15", "TPF50DD"] },
    { name: "Pressure", models: ["PSV25AP"] },
    { name: "Wayne", models: ["W800"] },
  ];
  await page.route("**/api/manufacturer?*", (r) => {
    const brand = new URL(r.request().url()).searchParams.get("brand");
    const variants = brands
      .filter((b) => !brand || b.name === brand)
      .map((b) => ({
        id: b.name,
        name: b.name,
        brand: b.name,
        header: [],
        models: b.models,
        rules: [],
        issues: [],
        match: { kind: "modelOnly" },
      }));
    return r.fulfill({
      json: {
        email: "test",
        revision: { filename: "catalog", imported_at: "2026-09-30" },
        brands,
        variants,
        rows: [],
        intervals: [],
        total: 0,
        page: 1,
        pageSize: 50,
        consumption: null,
      },
    });
  });
  await page.goto("/fabricante?brand=Wayne&model=W800&serial=1234");
  await expect(page.getByRole("combobox", { name: "Marca", exact: true })).toHaveValue("Wayne");
  await expect(page.locator("#manufacturer-models option")).toHaveCount(1);
  await page.getByRole("combobox", { name: "Marca", exact: true }).selectOption("Metalplan");
  await expect(page.getByLabel("Modelo", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Número de série", { exact: true })).toHaveValue(
    "",
  );
  await expect(page.locator("#manufacturer-models option")).toHaveCount(2);
  await expect(
    page.locator("#manufacturer-models option").first(),
  ).toHaveAttribute("value", "TPF15");
  await page.getByRole("button", { name: "Pesquisar", exact: true }).click();
  await expect(page).toHaveURL(/brand=Metalplan/);
  await page.reload();
  await expect(page.getByRole("combobox", { name: "Marca", exact: true })).toHaveValue(
    "Metalplan",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Limpar filtros", exact: true })
    .click();
  await expect(page.getByRole("combobox", { name: "Marca", exact: true })).toHaveValue("");
  await expect(page.locator("#manufacturer-models option")).toHaveCount(5);
  await expect(page).not.toHaveURL(/brand=/);
});
