import { test, expect } from "@playwright/test";
test("customer fleet links existing equipment, handles failure and refreshes the selected customer", async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: "m8-access", value: "test", domain: "localhost", path: "/" },
  ]);
  await page.route("**/api/activity", (r) =>
    r.fulfill({ json: { admin: true } }),
  );
  let refreshes = 0;
  await page.route("**/api/customer-fleet*", (r) => {
    if (new URL(r.request().url()).searchParams.has("customer")) {
      refreshes++;
      return r.fulfill({
        json: {
          customer: { id: "7", name: "Cliente atual" },
          updatedAt: new Date().toISOString(),
          machines: [],
        },
      });
    }
    return r.fulfill({
      json: { clients: [{ id: "7", name: "Cliente atual", machines: 0 }] },
    });
  });
  await page.route("**/api/equipment-management*", (r) =>
    r.fulfill({
      json: {
        rows: [
          {
            id: "42",
            name: "Compressor GA30",
            model: "GA30",
            serial: "SERIE42",
            clients: [],
          },
        ],
      },
    }),
  );
  const requests: any[] = [];
  await page.route("**/api/workshop/equipment", (r) => {
    requests.push(r.request().postDataJSON());
    return requests.length === 1
      ? r.fulfill({
          status: 503,
          json: { error: "Falha temporária no vínculo" },
        })
      : r.fulfill({
          json: {
            state: "complete",
            equipment: {
              id: "42",
              name: "Compressor GA30",
              integrationPending: requests.length === 2,
              integrationError: requests.length === 2 ? "O M8 respondeu HTTP 400. falhahttp_URL_http://erp.test/Pessoa/EquipamentosPessoaCadastroExterno" : null,
            },
          },
        });
  });
  await page.goto("/equipamentos/clientes");
  await page
    .getByRole("button", {
      name: "Incluir equipamento neste cliente",
      exact: true,
    })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole("button", { name: "Incluir existente", exact: true })
    .click();
  await expect(dialog.getByLabel("Cliente", { exact: true })).toHaveValue(
    "Cliente atual",
  );
  const submit = dialog.getByRole("button", {
    name: "Incluir equipamento ao cliente",
    exact: true,
  });
  await expect(submit).toBeDisabled();
  await dialog
    .getByRole("combobox", { name: "Equipamento existente", exact: true })
    .fill("SERIE42");
  await dialog
    .getByRole("option")
    .filter({ hasText: "Compressor GA30" })
    .click();
  await submit.click();
  await expect(dialog.getByRole("alert")).toHaveText(
    "Falha temporária no vínculo",
  );
  await submit.click();
  await expect(dialog.getByRole("alert")).toContainText("O vínculo foi salvo como pendência");
  await expect(dialog.getByRole("alert")).toContainText("O M8 apresentou uma falha interna");
  await expect(dialog).toBeVisible();
  await submit.click();
  await expect(dialog).toHaveCount(0);
  expect(requests[1]).toEqual({
    action: "link-existing",
    equipmentId: "42",
    customerKey: "m8:7",
    source: "workshop",
  });
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Equipamento incluído e vinculado" }),
  ).toBeVisible();
  await expect.poll(() => refreshes).toBeGreaterThan(1);
});
test("customer fleet creates equipment for a customer without machines with serial validation", async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: "m8-access", value: "test", domain: "localhost", path: "/" },
  ]);
  await page.route("**/api/activity", (r) =>
    r.fulfill({ json: { admin: true } }),
  );
  await page.route("**/api/customer-fleet*", (r) =>
    r.fulfill({
      json: new URL(r.request().url()).searchParams.has("customer")
        ? {
            customer: { id: "9", name: "Novo cliente" },
            updatedAt: new Date().toISOString(),
            machines: [],
          }
        : { clients: [] },
    }),
  );
  await page.route("**/api/equipment-management*", (r) =>
    r.fulfill({ json: { rows: [] } }),
  );
  await page.route("**/api/visits/customers*", (r) =>
    r.fulfill({ json: { rows: [{ id: "m8:9", name: "Novo cliente" }] } }),
  );
  let saved: any;
  await page.route("**/api/workshop/equipment*", (r) =>
    r.request().method() === "GET"
      ? r.fulfill({ json: { rows: [] } })
      : ((saved = r.request().postDataJSON()),
        r.fulfill({
          json: {
            state: "complete",
            equipment: {
              id: "88",
              name: "Compressor novo",
              integrationPending: true,
            },
          },
        })),
  );
  await page.goto("/equipamentos/clientes");
  await page
    .getByRole("button", {
      name: "Cadastrar / incluir equipamento",
      exact: true,
    })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("combobox", { name: "Cliente do equipamento", exact: true })
    .fill("Novo");
  await dialog.getByRole("option").filter({ hasText: "Novo cliente" }).click();
  await dialog
    .getByRole("combobox", {name:"Tipo do equipamento *",exact:true})
    .selectOption({ label: "Compressor Parafuso" });
  await dialog.getByLabel("Modelo *", { exact: true }).fill("GA30");
  await dialog.getByLabel("Série *", { exact: true }).fill("ABC-123");
  await dialog.getByLabel("Marca", { exact: true }).fill("Atlas Copco");
  await expect(
    dialog.getByText("Conferindo número de série…", { exact: true }),
  ).toHaveCount(0);
  await dialog
    .getByRole("button", { name: "Cadastrar e selecionar", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  expect(saved.customerKey).toBe("m8:9");
  expect(saved.brand).toBe("Atlas Copco");
  expect(saved.serial).toBe("ABC-123");
  await expect(
    page.getByRole("status").filter({ hasText: "aguarda confirmação no M8" }),
  ).toBeVisible();
});
