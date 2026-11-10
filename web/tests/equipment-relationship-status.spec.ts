import { test, expect } from "@playwright/test";
test("ERP inactive equipment shows its reason and respects the status filter", async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: "m8-access", value: "test", domain: "localhost", path: "/" },
  ]);
  await page.route("**/api/activity", (r) =>
    r.fulfill({ json: { admin: true } }),
  );
  await page.route("**/api/tasks", (r) =>
    r.fulfill({ json: { tasks: [], users: [], email: "tech" } }),
  );
  const inactive = {
    reason: "Equipamento vendido",
    at: "2026-11-10T12:00:00Z",
    by: "ERP M8",
    erpStatus: "confirmed",
  };
  const rows = [
    {
      id: "1",
      name: "Compressor em uso",
      serial: "ATIVO1",
      model: "GA30",
      ownership: "customer",
      plans: 0,
      clients: [{ id: "7", name: "Cliente atual" }],
    },
    {
      id: "2",
      name: "Compressor desativado",
      serial: "INATIVO2",
      model: "GA15",
      ownership: "customer",
      plans: 0,
      inactivation: inactive,
      clients: [
        {
          id: "8",
          name: "Cliente anterior",
          active: false,
          inactivation: inactive,
        },
      ],
    },
  ];
  await page.route("**/api/equipment-management*", (r) =>
    r.fulfill({
      json: {
        rows,
        total: 2,
        page: 1,
        pages: 1,
        counts: { equipment: 2, overdue: 0, soon: 0, unplanned: 2 },
        email: "tech",
      },
    }),
  );
  await page.goto("/equipamentos");
  await expect(
    page.getByText("Compressor em uso", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Compressor desativado", { exact: true }),
  ).toHaveCount(0);
  await page.getByText("Filtros de pesquisa", { exact: true }).click();
  await page.getByLabel("Status Equipamento").selectOption("inactive");
  const row = page
    .locator("tr")
    .filter({ has: page.getByText("Compressor desativado", { exact: true }) });
  await expect(row).toContainText("INATIVO");
  await expect(row).toContainText("Equipamento vendido");
  await expect(
    page.getByText("Compressor em uso", { exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Status Equipamento").selectOption("all");
  await expect(
    page.getByText("Compressor em uso", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Compressor desativado", { exact: true }),
  ).toBeVisible();
});
