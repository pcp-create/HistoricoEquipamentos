import { test, expect } from "@playwright/test";
test("visits require ERP contact fields, keep errors in popup and select confirmed contact", async ({
  page,
  context,
}) => {
  await page.route("**/api/contact-job-types", (r) =>
    r.fulfill({
      json: { rows: [{ id: "1", name: "Compras", m8_id: 7, active: true }] },
    }),
  );
  await context.addCookies([
    { name: "m8-refresh", value: "test", domain: "localhost", path: "/" },
  ]);
  const customer = {
    key: "m8:1",
    name: "Cliente de teste",
    tradeName: "COOPERSULCA",
    document: "123",
    city: "Lages",
    uf: "SC",
    address: "Rua Um",
    lead: false,
    latitude: null,
    longitude: null,
    lastVisit: null,
    health: "overdue",
    equipment: [],
  };
  await page.route("**/api/visits", (r) =>
    r.fulfill({
      json: {
        name: "Vendedor",
        customers: [customer],
        visits: [],
        purposes: [],
      },
    }),
  );
  await page.route("**/api/visits/machines*", (r) =>
    r.fulfill({ json: { machines: [], equipment: [] } }),
  );
  await page.route("**/api/customer-contacts?*", (r) =>
    r.fulfill({
      json: {
        contacts: [
          {
            id: "contact-1",
            name: "João",
            job_title: "15 FISCAL",
            cargo_id: 15,
            job_version: 1,
            phone: "0",
          },
        ],
      },
    }),
  );
  const writes: any[] = [];
  let fail = true;
  await page.route("**/api/customer-contacts", (r) => {
    const body = r.request().postDataJSON();
    if (r.request().method() === "PATCH") {
      expect(body).toMatchObject({
        customer: "m8:1",
        contactId: "contact-1",
        jobTypeId: "1",
        version: 1,
      });
      return r.fulfill({
        json: {
          contact: {
            id: "contact-1",
            name: "João",
            phone: "0",
            job_title: "Compras",
            cargo_id: 7,
            job_type_id: "1",
            job_version: 2,
          },
        },
      });
    }

    writes.push(body);
    return r.fulfill(
      fail
        ? { status: 400, json: { error: "Confira o ID do cargo no M8." } }
        : {
            json: {
              contact: { id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", ...body },
            },
          },
    );
  });
  await page.goto("/visitas");
  await page.getByRole("button", { name: /Visitas Sua carteira/ }).click();
  await page
    .getByRole("button", { name: "Agendar visita", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Cliente", exact: true })
    .fill("COOPERSULCA");
  await page.getByRole("option", { name: /Cliente de teste/ }).click();
  const picker = page.getByRole("combobox", {
    name: "Contato que receberá a visita",
  });
  await picker.fill("Fiscal");
  const option = page.getByRole("option", { name: /João/ });
  await expect(option).toContainText("Cargo: FISCAL");
  await expect(option).toContainText("Telefone: Não informado");
  await expect(option).not.toContainText("15 FISCAL");
  await option.click();
  await expect(picker).toHaveValue("João");
  await page
    .getByRole("button", { name: "Editar cargo do contato", exact: true })
    .click();
  const jobEditor = page.getByRole("dialog", {
    name: "Editar cargo do contato",
    exact: true,
  });
  await expect(jobEditor).toContainText("A alteração será salva no portal.");
  await jobEditor.getByLabel("Cargo do contato").selectOption("1");
  await jobEditor
    .getByRole("button", { name: "Salvar cargo", exact: true })
    .click();
  await expect(jobEditor).toHaveCount(0);
  await expect(page.locator(".customer-contact-summary")).toContainText(
    "Compras",
  );

  await page
    .getByRole("button", { name: "+ Novo contato", exact: true })
    .click();
  const popup = page.getByRole("dialog", { name: "Novo contato", exact: true });
  await popup.getByLabel("Nome do contato").fill("Ana");
  await popup
    .getByLabel("Telefone do contato", { exact: true })
    .fill("49999070882");
  await expect(
    popup.getByRole("button", { name: "Salvar contato", exact: true }),
  ).toBeDisabled();
  expect(writes).toHaveLength(0);
  await popup.getByLabel("E-mail do contato").fill("ana@example.com");
  await popup.getByLabel("Cargo do contato").selectOption("1");
  await expect(popup.getByLabel("Tipo de contato")).toHaveCount(0);
  await popup.getByLabel("Telefone adicional").fill("4933334444");
  await popup.getByLabel("CPF/CNPJ do contato").fill("12345678901");
  await popup.getByLabel("Observação", { exact: true }).fill("Compras");
  await popup
    .getByRole("button", { name: "Salvar contato", exact: true })
    .click();
  await expect(popup.getByRole("alert")).toHaveText(
    "Confira o ID do cargo no M8.",
  );
  await expect(popup.getByLabel("E-mail do contato")).toHaveValue(
    "ana@example.com",
  );
  fail = false;
  await popup
    .getByRole("button", { name: "Salvar contato", exact: true })
    .click();
  await expect(popup).toHaveCount(0);
  expect(writes[1]).toMatchObject({
    customer: "m8:1",
    email: "ana@example.com",
    job_type_id: "1",
    contact_type: "Geral",
    document: "12345678901",
    notes: "Compras",
  });
  await expect(page.getByLabel("Contato que receberá a visita")).toHaveValue(
    "Ana",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "+ Novo contato", exact: true })
    .click();
  await expect(popup).toBeVisible();
  expect(await popup.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
  await popup.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(page.getByLabel("Contato que receberá a visita")).toHaveValue(
    "Ana",
  );
});
