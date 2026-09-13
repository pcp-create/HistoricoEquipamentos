import { test, expect } from "@playwright/test";
test("catalog settings inspects existing structure, validates required manual fields and confirms preview", async ({
  page,
  context,
  request,
}) => {
  expect((await request.get("/api/catalog-configuration")).status()).toBe(401);
  await context.addCookies([
    { name: "m8-access", value: "test", domain: "localhost", path: "/" },
  ]);
  const saves: unknown[] = [];
  await page.route("**/api/catalog-configuration*", async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() === "POST") {
      if (url.searchParams.has("preview"))
        return route.fulfill({
          json: {
            records: [
              {
                manufacturer: "Marca",
                model: "SM15",
                version: "V1",
                serial: "",
                section: "Filtros",
                description: "Filtro",
                reference: "1234567890",
                interval: "4000",
                observation: "",
              },
            ],
            errors: [],
          },
        });
      saves.push(route.request().postDataJSON());
      return route.fulfill({ json: { inserted: 1, skipped: 0 } });
    }
    if (url.searchParams.has("variant"))
      return route.fulfill({
        json: {
          items: [
            {
              id: "entry",
              section: "Filtros",
              description: "Filtro original",
              code_original: "0012345678",
              interval_original: "4000",
              observation: "Conferir",
            },
          ],
        },
      });
    return route.fulfill({
      json: {
        email: "test@example.com",
        versions: [
          {
            id: "version",
            name: "Marca · SM15 · V1",
            header: ["SM15"],
            models: ["SM15"],
            rules: [],
            issues: [],
            items: 1,
            filename: "Original.xls",
          },
        ],
      },
    });
  });
  await page.goto("/configuracoes");
  await expect(
    page.getByRole("heading", {
      name: "Configuração do catálogo do fabricante",
    }),
  ).toBeVisible();
  await page.getByLabel("Versão cadastrada").selectOption("version");
  await expect(
    page.getByRole("cell", { name: "Filtro original" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Baixar planilha modelo" }),
  ).toHaveAttribute("href", "/api/catalog-configuration?template=1");
  await page
    .getByRole("button", { name: "Adicionar item ao catálogo" })
    .click();
  expect(saves).toHaveLength(0);
  for (const [label, value] of [
    ["Fabricante *", "Marca"],
    ["Modelo *", "SM15"],
    ["Versão *", "V1"],
    ["Grupo *", "Filtros"],
    ["Descrição da peça *", "Filtro"],
    ["Referência genuína *", "1234567890"],
    ["Intervalo em horas *", "4000"],
  ])
    await page.getByLabel(label, { exact: true }).fill(value);
  await page
    .getByRole("button", { name: "Adicionar item ao catálogo" })
    .click();
  await expect.poll(() => saves.length).toBe(1);
  await page
    .getByLabel("Planilha preenchida")
    .setInputFiles({
      name: "teste.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: Buffer.from("fixture"),
    });
  const confirm = page.getByRole("button", {
    name: "Confirmar importação de 1 itens",
  });
  await expect(confirm).toBeVisible();
  expect(saves).toHaveLength(1);
  await confirm.click();
  await expect.poll(() => saves.length).toBe(2);
});
