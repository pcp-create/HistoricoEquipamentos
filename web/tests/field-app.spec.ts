import { test, expect } from "@playwright/test";
test("mobile technician confirms pieces before starting work with location", async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: "m8-access", value: "test", domain: "localhost", path: "/" },
  ]);
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: -27, longitude: -49 });
  await page.setViewportSize({ width: 390, height: 844 });
  const row = {
    id: "op1",
    schedule_id: 1,
    number: 14830,
    customer: "Cliente de teste",
    city: "Timbó",
    state: "SC",
    equipment: "Compressor GA110",
    date: "2026-09-29",
    time: "08:00",
    position: 1,
    description: "Manutenção",
    status: "awaiting_execution",
  };
  let checked = false;
  let infoRead = false;
  let active: any = null;
  const actions: any[] = [];
  await page.route("**/api/activity", (r) => r.fulfill({ json: {} }));
  await page.route("**/api/field*", async (r) => {
    if (r.request().method() === "POST") {
      const b = r.request().postDataJSON();
      actions.push(b);
      if (b.action === "info_read") infoRead=true;
      if (b.action === "materials") checked = true;
      if (b.action === "start_work")
        active = {
          id: "session",
          operation_id: "op1",
          kind: "work",
          state: "running",
          segment_at: new Date().toISOString(),
          active_seconds: 0,
          pause_seconds: 0,
        };
      await r.fulfill({ json: { ok: true } });
      return;
    }
    await r.fulfill({
      json: r.request().url().includes("?")
        ? {
            checked, infoRead,
            operation: {
              ...row,
              document: {
                responsible: "tech@test.com",
                internalNote: "Inspecionar antes de iniciar",
              },
            },
            email: "tech@test.com",
            settings: {
              document: { vehicles: [], pauseReasons: [], checklists: [] },
            },
            materials: { complete: true, items: [] },
            history: [],
          }
        : { email: "tech@test.com", rows: [row], active },
    });
  });
  await page.goto("/tecnico");
  await page.getByRole("button", { name: "Programação" }).click();
  await page.getByText("OS 14830", { exact: true }).click();
  await page.getByRole("button", { name: /Operação 1/ }).click();
  await expect(
    page.getByRole("button", { name: "Iniciar atividade" }),
  ).toBeDisabled();
  await expect(page.getByRole("button", { name: "Peças", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Informações", exact: true }).click();
  await page.getByRole("button", { name: "Li e compreendi as informações" }).click();
  await page.getByRole("button", { name: "Peças", exact: true }).click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Confirmar conferência" }).click();
  await expect(page.getByRole("button", { name: "Informações", exact: true })).toBeHidden();
  await page.getByRole("button", { name: "Voltar ao menu", exact: true }).last().click();
  await expect(
    page.getByRole("button", { name: "Iniciar atividade" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Iniciar atividade" }).click();
  await expect(
    page.getByRole("button", { name: "Pausar atividade" }),
  ).toBeVisible();
  expect(actions.map((x) => x.action)).toEqual(["info_read", "materials", "start_work"]);
  expect(actions[1].location.latitude).toBe(-27);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const light=page.getByRole("button", {name:"Finalizar Operação",exact:true}).locator('.field-menu-light');
  const bounds=await light.boundingBox();
  expect(bounds?.width).toBe(10);
  expect(bounds?.height).toBe(10);
  await page.screenshot({ path: "/tmp/field-pilot.png", fullPage: true });
});
