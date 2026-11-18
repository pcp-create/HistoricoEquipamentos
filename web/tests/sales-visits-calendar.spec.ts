import { test, expect, type Page, type BrowserContext } from "@playwright/test";
async function openCalendar(page: Page, context: BrowserContext) {
  await page.clock.setFixedTime(new Date("2026-11-10T15:00:00Z"));
  await context.addCookies([
    { name: "m8-refresh", value: "test", domain: "localhost", path: "/" },
  ]);
  const customers = ["Agendada", "Realizada", "Cancelada"].map(
    (name, index) => ({
      key: "m8:" + index,
      name,
      document: "",
      city: "Lages",
      uf: "SC",
      lead: false,
      health: "current",
      equipment: [],
    }),
  );
  const visits = ["scheduled", "completed", "cancelled"].map(
    (status, index) => ({
      id: "v" + index,
      customer_key: "m8:" + index,
      seller: "seller@test",
      status,
      version: 1,
      scheduled_at: "2026-11-10T12:00:00-03:00",
      completed_at: status === "completed" ? "2026-11-10T13:00:00-03:00" : null,
      contact: "Contato",
      phone: "47999999999",
      description: "",
      outcome: "",
    }),
  );
  const events = visits.map((v, i) => ({
    id: "visit:" + v.id,
    source: "visits",
    sourceId: v.id,
    day: "2026-11-10",
    time: "12:00",
    title: "Visita comercial",
    customer: customers[i].name,
    description: "",
    status: v.status,
    state: v.status === "scheduled" ? "pending" : v.status,
    href: "/visitas?visit=" + v.id,
  }));
  events.push({
    id: "operation:op1",
    source: "operations",
    sourceId: "op1",
    day: "2026-11-10",
    time: "08:00",
    title: "OS 15000 · Operação 01",
    customer: "Cliente técnico",
    description: "Manutenção",
    status: "executing",
    state: "pending",
    href: "/tecnico?operation=op1",
  });
  await page.route("**/api/visits", (r) =>
    r.fulfill({
      json: { name: "Vendedor", customers, visits, purposes: [], sellers: [] },
    }),
  );
  await page.route("**/api/calendar?*", (r) =>
    r.fulfill({ json: { events, updatedAt: "2026-11-10T15:00:00Z" } }),
  );
  await page.goto("/visitas");
  await page.getByRole("button", { name: /Visitas Sua carteira/ }).click();
  await page.getByRole("button", { name: "Calendário", exact: true }).click();
  return page.getByRole("region", { name: "Calendário integrado" });
}
test("seller calendar combines visits and OSs and preserves visit actions with source/status filters", async ({
  page,
  context,
}) => {
  const calendar = await openCalendar(page, context),
    rows = calendar.locator(".sales-visit-row");
  await expect(rows).toHaveCount(3);
  await expect(calendar).toContainText("OS 15000");
  await calendar.getByRole("button", { name: "Visitas", exact: true }).click();
  await expect(calendar).not.toContainText("OS 15000");
  await calendar.getByLabel("Situação dos eventos").selectOption("completed");
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText("Realizada");
  await calendar.getByRole("button", { name: "Semana", exact: true }).click();
  await expect(rows).toHaveCount(1);
  await calendar.getByRole("button", { name: "Dia", exact: true }).click();
  await expect(rows).toHaveCount(1);
  await calendar.getByLabel("Situação dos eventos").selectOption("cancelled");
  await expect(rows).toContainText("Cancelada");
  await calendar.getByRole("button", { name: "Mês", exact: true }).click();
  await expect(rows).toHaveCount(1);
  await calendar.getByLabel("Situação dos eventos").selectOption("pending");
  await expect(rows).toContainText("Agendada");
});
test("mobile integrated calendar fits the viewport and identifies sources on calendar days", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const calendar = await openCalendar(page, context);
  const today = calendar.getByRole("button", {
    name: "10/11/2026: 4 eventos",
    exact: true,
  });
  await expect(today).toBeVisible();
  await expect(today.locator(".unified-calendar-dots i")).toHaveCount(2);
  await calendar
    .getByRole("button", { name: "Operações de OSs", exact: true })
    .click();
  await expect(calendar.locator(".sales-visit-row")).toHaveCount(0);
  await expect(calendar.getByRole("article")).toHaveCount(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/visits-calendar-mobile.png",
    fullPage: true,
  });
});
