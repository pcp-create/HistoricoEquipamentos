import { test, expect } from "@playwright/test";
test("map groups colocated OSs, filters by date and saves a manual point on mobile", async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: "m8-access", value: "test", domain: "localhost", path: "/" },
  ]);
  await page.route("**/api/activity", (r) =>
    r.fulfill({ json: { admin: true } }),
  );
  const tileReferers: (string | undefined)[] = [];
  await page.route("https://tile.openstreetmap.org/**", async (r) => {
    tileReferers.push((await r.request().allHeaders()).referer);
    return r.fulfill({
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
        "base64",
      ),
    });
  });
  const schedules = [1, 2, 3].map((n) => ({
    id: String(n),
    order_id: String(14876 + n),
    company_id: 1,
    cliente_nome: "Cliente " + n,
    operation_count: 1,
    programming_status: "scheduled",
    operation_status_counts: { scheduled: 1 },
    calendar_operations: [
      {
        date: n === 3 ? "2026-10-02" : "2026-10-01",
        dates: [n === 3 ? "2026-10-02" : "2026-10-01"],
        time: "08:00",
        responsible: "Técnico",
        responsibleEmail: "tech",
      },
    ],
  }));
  const maps = {
    geocodingAvailable: false,
    schedules: schedules.map((s, i) => ({
      id: s.id,
      selectedAddressId: s.id,
      reason: "Endereço padrão",
      localities: [
        {
          address_id: s.id,
          person_id: s.id,
          address_type: "Padrao",
          street: "Rua A",
          number: "1",
          city: "Aurora",
          state: "SC",
          latitude: i < 2 ? -27.31 : null,
          longitude: i < 2 ? -49.63 : null,
          precision: i < 2 ? "postcode" : "confirmed",
          provider: "manual",
        },
      ],
    })),
  };
  let writes = 0;
  await page.route("**/api/service-scheduling**", async (r) => {
    if (r.request().url().includes("/map")) {
      if (r.request().method() === "POST") {
        const b = r.request().postDataJSON();
        expect(b.scheduleId).toBe("3");
        expect(b.action).toBe("manual");
        expect(b.latitude).toBe(-27.4);
        writes++;
        Object.assign(maps.schedules[2].localities[0], {
          latitude: b.latitude,
          longitude: b.longitude,
        });
      }
      return r.fulfill({ json: maps });
    }
    return r.fulfill({
      json: {
        schedules,
        users: [],
        settings: {
          document: {
            calendars: [],
            checklists: [],
            serviceTypes: [],
            vehicles: [],
          },
        },
        canEditSettings: true,
      },
    });
  });
  await page.route("**/api/service-scheduling/territories", r => {
    if (r.request().method() === "POST") {
      expect(r.request().postDataJSON()).toEqual({id:"11",version:1,seller:"Vendedor A"});
      return r.fulfill({json:{id:"11",version:2,seller:"Vendedor A"}});
    }
    return r.fulfill({ json: {
    type: "FeatureCollection", missing: [], features: [
      { type: "Feature", properties: { id: "10", version: 1, city: "Aurora", uf: "SC", seller: "Vendedor A" }, geometry: { type: "Polygon", coordinates: [[[-49.7,-27.4],[-49.5,-27.4],[-49.5,-27.2],[-49.7,-27.4]]] } },
      { type: "Feature", properties: { id: "11", version: 1, city: "Rio do Sul", uf: "SC", seller: "Vendedor B" }, geometry: { type: "Polygon", coordinates: [[[-49.7,-27.2],[-49.5,-27.2],[-49.5,-27.0],[-49.7,-27.2]]] } },
    ],
  } }); });
  await page.goto("/programacao");
  await page.getByRole("button", { name: "Mapa", exact: true }).click();
  await expect(page.locator(".schedule-map-pin")).toHaveText("2");
  await expect(
    page.getByRole("button", { name: "2 OSs neste local", exact: true }),
  ).toBeVisible();
  const circle = page.locator(".schedule-map-pin");
  expect(
    await circle.evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        width: s.width,
        height: s.height,
        radius: s.borderRadius,
        fill: s.backgroundColor,
      };
    }),
  ).toEqual({
    width: "32px",
    height: "32px",
    radius: "50%",
    fill: "rgb(35, 112, 184)",
  });
  await expect.poll(() => tileReferers.length).toBeGreaterThan(0);
  expect(
    tileReferers.every((value) => value === "http://localhost:3100/"),
  ).toBe(true);
  await expect(page.getByText("2 de 3 OSs no mapa")).toBeVisible();
  await page.locator(".schedule-map-pin").click();
  await expect(page.locator(".schedule-map-popup")).toContainText("OS 14877");
  await expect(page.locator(".schedule-map-popup")).toContainText("OS 14878");
  await expect(page.locator(".schedule-map-popup")).toContainText(
    "Aproximada: região do CEP",
  );
  await page.locator(".schedule-map-popup").getByRole("button", { name: "Ajustar posição" }).first().click();
  await expect(page.locator(".schedule-map-canvas")).toHaveClass(/leaflet-container/);
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await page.getByLabel("Data das operações").fill("2026-10-02");
  await expect(page.locator(".schedule-map-pin")).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    (await page.getByLabel("Data das operações").boundingBox())!.width,
  ).toBeGreaterThan(120);
  await page.locator(".schedule-map-pending > summary").click();
  await page
    .getByRole("button", { name: "Marcar no mapa", exact: true })
    .click();
  await expect(page.locator(".schedule-map-canvas")).toHaveClass(/leaflet-container/);
  await page.locator(".schedule-map-canvas").click({ position: { x: 100, y: 120 } });
  await expect(page.getByLabel("Latitude", { exact: true })).not.toHaveValue("");
  await page.getByLabel("Latitude", { exact: true }).fill("-27.4");
  await page.getByLabel("Longitude", { exact: true }).fill("-49.5");
  await page.getByRole("button", { name: "Salvar posição" }).click();
  await expect(page.getByText("1 de 1 OSs no mapa")).toBeVisible();
  expect(writes).toBe(1);
  await page.locator(".schedule-map-pin").click();
  await page.locator(".schedule-map-popup").getByRole("button", { name: "Ajustar posição" }).click();
  await expect(page.locator(".schedule-map-canvas")).toHaveClass(/leaflet-container/);
  await page.getByRole("button", { name: "Salvar posição" }).click();
  await expect(page.getByRole("button", { name: "Salvar posição" })).toHaveCount(0);
  expect(writes).toBe(2);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "/tmp/schedule-map-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.getByRole("button", { name: "Limpar data e status" }).click();
  await expect(page.locator(".schedule-map-pin")).toHaveCount(2);
  for (
    let i = 0;
    i < 6 && (await page.locator(".schedule-map-pin").count()) > 1;
    i++
  ) {
    await page.locator(".leaflet-control-zoom-out").click();
    await page.waitForTimeout(300); // Leaflet completes the zoom animation before regrouping.
  }
  await expect(page.locator(".schedule-map-pin")).toHaveText("3");
  await page.locator(".schedule-map-pin").click();
  await expect(page.locator(".schedule-map-pin")).toHaveCount(2);

  await page.getByRole("button", { name: "Divisão comercial", exact: true }).click();
  await expect(page.locator(".schedule-map-territories")).toContainText("Vendedor A");
  await expect(page.locator(".leaflet-overlay-pane path")).toHaveCount(2);
  await page.getByLabel("Vendedor", { exact: true }).selectOption("Vendedor B");
  await expect(page.locator(".leaflet-overlay-pane path")).toHaveCount(1);
  await page.locator(".leaflet-overlay-pane path").dispatchEvent("click");
  await expect(page.locator(".schedule-map-summary .schedule-territory-editor")).toBeVisible();
  await expect(page.locator(".leaflet-popup .schedule-territory-editor")).toHaveCount(0);
  await page.getByRole("button", {name:"Editar vendedor",exact:true}).click();
  await page.getByLabel("Vendedor do município").selectOption("Vendedor A");
  await page.screenshot({path:"/tmp/territory-editor.png"});
  await page.getByRole("button", {name:"Confirmar alteração do vendedor"}).click({timeout:10000});
  await expect(page.locator(".leaflet-overlay-pane path")).toHaveCount(0);
  await page.getByRole("button", { name: "Divisão comercial", exact: true }).click();
  await expect(page.locator(".leaflet-overlay-pane path")).toHaveCount(0);
  await page.screenshot({
    path: "/tmp/schedule-map-desktop.png",
    fullPage: true,
  });
});

test("opening map locates missing addresses once per locality and leaves failed addresses for review", async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: "m8-access", value: "test", domain: "localhost", path: "/" },
  ]);
  await page.route("**/api/activity", (r) =>
    r.fulfill({ json: { admin: true } }),
  );
  await page.route("https://tile.openstreetmap.org/**", (r) => r.abort());
  const schedules = [1, 2, 3].map((n) => ({
    id: String(n),
    order_id: String(100 + n),
    company_id: 1,
    cliente_nome: "Cliente",
    operation_count: 0,
    programming_status: "pending",
    operation_status_counts: {},
    calendar_operations: [],
  }));
  const data = {
    geocodingAvailable: true,
    schedules: schedules.map((s, i) => ({
      id: s.id,
      selectedAddressId: i < 2 ? "7" : "8",
      reason: "Padrão",
      localities: [
        {
          person_id: i < 2 ? "7" : "8",
          address_id: i < 2 ? "7" : "8",
          address_type: "Padrao",
          street: "Rua A",
          number: "1",
          city: "Aurora",
          state: "SC",
          latitude: null as number | null,
          longitude: null as number | null,
        },
      ],
    })),
  };
  const calls: string[] = [];
  await page.route("**/api/service-scheduling**", async (r) => {
    if (r.request().url().includes("/map")) {
      if (r.request().method() === "POST") {
        const b = r.request().postDataJSON();
        expect(b.action).toBe("geocode");
        calls.push(b.addressId);
        if (b.addressId === "8")
          return r.fulfill({
            status: 400,
            json: { error: "Confira o endereço manualmente." },
          });
        data.schedules
          .filter((s) => s.selectedAddressId === "7")
          .forEach((s) =>
            Object.assign(s.localities[0], {
              latitude: -27.3,
              longitude: -49.6,
            }),
          );
      }
      return r.fulfill({ json: data });
    }
    return r.fulfill({
      json: {
        schedules,
        users: [],
        settings: {
          document: {
            calendars: [],
            checklists: [],
            serviceTypes: [],
            vehicles: [],
          },
        },
        canEditSettings: true,
      },
    });
  });
  await page.goto("/programacao");
  await page.getByRole("button", { name: "Mapa", exact: true }).click();
  await expect(page.getByText("2 de 3 OSs no mapa")).toBeVisible();
  await expect(page.locator(".schedule-map-error")).toHaveText(
    "Confira o endereço manualmente.",
  );
  await expect(
    page.getByRole("button", { name: "Atualizar localidades" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Atualizar localidades" }).click();
  await expect(
    page.getByRole("button", { name: "Atualizar localidades" }),
  ).toBeEnabled();
  expect(calls).toEqual(["7", "8"]);
});
