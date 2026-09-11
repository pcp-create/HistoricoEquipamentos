import { test, expect } from "@playwright/test";
const sampleRows = Array.from({ length: 8 }, (_, i) => ({
  company_id: [1, 2, 27404][i % 3],
  id: String(14681 - i * 3),
  number: String(14681 - i * 3),
  date: "2026-09-09T12:00:00Z",
  client: [
    "Indústria Horizonte Ltda",
    "Metalúrgica Silva",
    "Alfa Alimentos",
    "Beta Logística",
  ][i % 4],
  document: "00.000.000/0001-00",
  equipment: ["Compressor de ar", "Compressor parafuso", "Secador de ar"][
    i % 3
  ],
  model: ["GA 75", "GX 11", "FD 50"][i % 3],
  serial: ["SN123456", "BRP076452", "AIF098743"][i % 3],
  status: ["Processado", "Pendente", "Cancelado", "Processado"][i % 4],
  detail_at: "2026-09-11T02:42:00Z",
  materials: i + 1,
  amount: "1290.50",
  material: ["Filtro de óleo", "Elemento separador", "Óleo para compressor"][
    i % 3
  ],
  reference: "1622365200",
  quantity: "2",
  unit: "UN",
  item_id: String(i),
  is_excluded: i === 1,
  current: {
    unit: "UN",
    sale_price: "1000",
    minimum_price: "800",
    stock: "12",
    available: "9",
    stock_value: "1200",
    price_at: new Date().toISOString(),
    stock_at: new Date().toISOString(),
    available_at: new Date().toISOString(),
  },
}));
test("authentication is enforced on page, search, export and detail API", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
  await expect(
    page.getByRole("heading", { name: "Bem-vindo de volta" }),
  ).toBeVisible();
  for (const path of [
    "/api/history",
    "/api/history?export=csv",
    "/api/orders/1/1",
  ])
    expect((await request.get(path)).status()).toBe(401);
  expect(
    (
      await request.post("/api/session", {
        data: { email: "x", password: "x" },
        headers: { Origin: "https://other.example" },
      })
    ).status(),
  ).toBe(403);
  await page.screenshot({ path: "test-results/login.png", fullPage: true });
});
test("history UI: search, filters, views, detail, pagination, export, empty/error and mobile", async ({
  page,
  context,
}) => {
  // Fixtures only in this test; no authentication bypass or demo data exists in the application.
  await context.addCookies([
    { name: "m8-access", value: "test-only", domain: "localhost", path: "/" },
  ]);
  await page.route("**/api/history?*", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("overview"))
      return route.fulfill({
        json: {
          orders: 12650,
          materials: 5474,
          clients: 986,
          imported: 1599,
          updated: "2026-09-11T02:42:00Z",
          statuses: ["Processado", "Pendente", "Cancelado"],
          email: "teste@example.com",
        },
      });
    if (url.searchParams.get("export"))
      return route.fulfill({
        contentType: "text/csv",
        body: "Número OS;Cliente\n14681;Exemplo",
      });
    if (url.searchParams.get("q") === "erro")
      return route.fulfill({
        status: 503,
        json: { error: "Consulta indisponível" },
      });
    return route.fulfill({
      json: {
        rows: url.searchParams.get("q") === "inexistente" ? [] : sampleRows,
        total: url.searchParams.get("q") === "inexistente" ? 0 : 127,
        page: Number(url.searchParams.get("page") || 1),
        size: 25,
      },
    });
  });
  await page.route("**/api/orders/*/*", (route) =>
    route.fulfill({
      json: {
        order: {
          id_m8: 14681,
          cliente_nome: "Indústria Horizonte Ltda",
          equipamento: "Compressor de ar",
          modelo_equipamento: "GA 75",
          status: "Processado",
          emissao: "2026-09-09T12:00:00Z",
          total_geral: 1290.5,
          observacao: "Vedação revisada",
        },
        materials: [
          {
            produto_nome: "Filtro de óleo",
            referencia_fabricante: "1622365200",
            produto_id: 5,
            quantidade: 2,
            unidade_nome: "UN",
            esta_excluido: true,
            observacao: "Aplicado na revisão",
          },
        ],
        equipment: [{ numero_serie: "SN123456", horimetro: "1500" }],
        detail_at: "2026-09-11T02:42:00Z",
      },
    }),
  );
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByText("127", { exact: true }).first()).toBeVisible();
  await page.screenshot({
    path: "test-results/history-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Por material", exact: true }).click();
  await expect(page.locator("table .excluded-description")).toHaveCount(1);
  await expect(
    page.getByRole("columnheader", { name: "Preços atuais", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .locator("table")
      .getByText(/Abaixo do mínimo atual/)
      .first(),
  ).toBeVisible();
  await expect(
    page
      .locator("table")
      .getByText(/Disponível:/)
      .first(),
  ).toBeVisible();
  await expect(page.locator("table .excluded-description")).toHaveCSS(
    "color",
    "rgb(180, 35, 24)",
  );
  await expect(page.locator("table").getByText("Excluído da OS")).toHaveCount(
    1,
  );
  await expect(
    page.getByRole("columnheader", { name: "Material aplicado" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Ver detalhes da OS 14681" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("dialog").getByText("Excluído da OS"),
  ).toBeVisible();
  await page.getByText("Todos os campos da OS").click();
  await expect(page.getByText("Vedação revisada")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("button", { name: "Próxima página" }).click();
  await expect(page).toHaveURL(/page=2/);
  await page
    .getByRole("textbox", { name: "Pesquisa global" })
    .fill("filtro SN123");
  await page.getByRole("button", { name: "Pesquisar", exact: true }).click();
  await expect(page).toHaveURL(/q=filtro\+SN123/);
  await expect(page).toHaveURL(/page=1/);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar CSV" }).click();
  expect((await download).suggestedFilename()).toMatch(/historico-materiais/);
  await page
    .getByRole("textbox", { name: "Pesquisa global" })
    .fill("inexistente");
  await page.getByRole("button", { name: "Pesquisar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Nenhum registro encontrado" }),
  ).toBeVisible();
  await page.getByRole("textbox", { name: "Pesquisa global" }).fill("erro");
  await page.getByRole("button", { name: "Pesquisar", exact: true }).click();
  await expect(page.locator(".results-error")).toContainText(
    "Consulta indisponível",
  );
  await page.getByRole("button", { name: "Limpar", exact: true }).click();
  await expect(page.locator(".results-error")).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/history-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
