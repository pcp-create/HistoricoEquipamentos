import { test, expect } from "@playwright/test";

for (const rental of [false, true])
  test(`workshop displays open order value in dashboard, list, card and equipment details (rental=${rental})`, async ({
    page,
    context,
  }) => {
    await context.addCookies([
      { name: "m8-access", value: "test", domain: "localhost", path: "/" },
    ]);
    const financial = {
      kind: rental ? "cost" : "sale",
      total: 1234.56,
      missing: 0,
      unlinked: false,
      orders: [
        {
          id: "400",
          company: 1,
          number: "15119",
          status: "Aprovado",
          situation: rental ? "CUSTO DE LOCAÇÃO" : "COBRANÇA CRM/AT",
          amount: 1234.56,
        },
      ],
    };
    const visit = {
      id: "10000000-0000-4000-8000-000000000001",
      equipment_id: "16929",
      name: "Equipamento financeiro",
      model: "GA75",
      serial: "ABC",
      client: "Cliente financeiro",
      rental,
      workshop_id: "1",
      workshop: "RJ Compressores",
      entered_at: "2026-10-10T12:00:00Z",
      exited_at: null,
      stage: "repair",
      effective_stage: "repair",
      version: 1,
      orders: [],
      quotes: [],
      drafts: [],
      tasks: [],
      external: [],
      events: [],
      financial,
    };
    await page.route("**/api/**", (r) => r.fulfill({ json: { admin: true } }));
    await page.route("**/api/workshop", (r) =>
      r.fulfill({
        json: {
          workshops: [{ id: "1", name: "RJ Compressores", active: true }],
          visits: [visit],
          external: [],
          imports: [],
        },
      }),
    );
    let detailReads = 0;
    await page.route("**/api/workshop?financial=*", (r) => {
      detailReads++;
      return r.fulfill({
        json: {
          financial,
          orders: [
            {
              ...financial.orders[0],
              detailAt: "2026-10-28T12:00:00Z",
              products: [
                {
                  id: "1",
                  name: "Filtro de óleo",
                  reference: "ABC",
                  quantity: 2,
                  unit: "UN",
                  unit_price: 500,
                  amount: 1000,
                  excluded: false,
                  approval: "true",
                },
                {
                  id: "2",
                  name: "Filtro excluído",
                  quantity: 1,
                  unit: "UN",
                  unit_price: 99,
                  amount: 99,
                  excluded: true,
                },
              ],
              services: [
                {
                  id: "1",
                  name: "Revisão preventiva",
                  quantity: 1,
                  unit: "H",
                  unit_price: 234.56,
                  amount: 234.56,
                  excluded: false,
                },
              ],
            },
          ],
        },
      });
    });
    await page.goto("/oficina");
    const kpi = page
      .locator(".ws-kpi")
      .filter({ hasText: "Valor parado em oficina" });
    await expect(kpi).toContainText(rental ? "0,00" : "1.234,56");
    expect(detailReads).toBe(0);
    await expect(page.locator(".ws-priority tbody tr")).toContainText(
      "1.234,56",
    );
    await expect(page.locator(".ws-priority tbody tr")).toContainText(
      rental ? "Custo das OSs abertas" : "Venda das OSs de cobrança abertas",
    );
    await page
      .getByRole("button", { name: "Equipamentos", exact: true })
      .click();
    await expect(page.locator(".ws-equipment-list tbody tr")).toContainText(
      "1.234,56",
    );
    await expect(
      page.getByRole("columnheader", { name: "Valor envolvido", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Kanban", exact: true }).click();
    await expect(page.locator(".ws-machine")).toContainText("1.234,56");
    await page.locator(".ws-machine").click();
    const detail = page.locator(".ws-financial-orders");
    await expect(detail).toContainText("Somente OSs em aberto");
    await expect(detail).toContainText(financial.orders[0].situation);
    await expect(detail.getByRole("link")).toHaveAttribute(
      "href",
      "/historico?createdCompany=1&createdOrder=400",
    );
    await expect(detail).toContainText("1.234,56");
    await detail.getByRole("button", { name: "Produtos e serviços" }).click();
    const items = page.getByRole("region", {
      name: "Produtos e serviços das OSs",
    });
    await expect(items).toContainText("Filtro de óleo");
    await expect(items).toContainText("Filtro excluído");
    await expect(items.locator(".ws-item-excluded")).toContainText("Excluído");
    await expect(items).toContainText("1.000,00");
    const readsBeforeSwitch=detailReads;
    await items.getByRole("tab", { name: "Serviços", exact: true }).click();
    await expect(items).toContainText("Revisão preventiva");
    await expect(items).not.toContainText("Filtro de óleo");
    expect(detailReads).toBe(readsBeforeSwitch);
  });
