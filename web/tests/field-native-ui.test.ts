import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
test("packaged interface persists to SQLite and opens with suspended server", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "rj-native-test-"));
  let sqlite = new DatabaseSync(path.join(directory, "portal.db"));
  sqlite.exec(
    "CREATE TABLE records (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
  );
  const assets = path.resolve("../android/app/build/generated/portalAssets");
  const nativeSource = readFileSync(path.resolve("../android/app/src/main/java/app/rjcompressores/tecnico/PortalActivity.java"),"utf8");
  const policy = nativeSource.match(/headers.put\("Content-Security-Policy","([^"]+)"\)/)![1];
  let blocked = false;
  let internetOverride: boolean | null = null;
  let receivedPhotos = 0;
  const id = "10000000-0000-4000-8000-000000000001";
  const row = {
    id,
    schedule_id: 1,
    position: 1,
    number: "15025",
    customer: "Cliente de teste",
    equipment: "Compressor TPF100",
    description: "Inspeção",
    version: 1,
    status: "awaiting_execution",
  };
  const detail = {
    email: "tech",
    operation: {
      ...row,
      document: {
        responsible: "tech",
        support: [],
        checklistId: "c",
        checklistRun: {
          template: {
            name: "Relatório técnico",
            stages: [
              {
                id: "s",
                name: "01. Relatório técnico",
                fields: [
                  { id: "text", label: "Serviço realizado", type: "textarea" },
                ],
              },
            ],
          },
          stages: { s: { status: "released", answers: {} } },
        },
      },
    },
    infoRead: true,
    checked: true,
    progress: {},
    materials: { complete: true, items: [] },
    settings: { document: { checklists: [], pauseReasons: [], vehicles: [] } },
    history: [],
    finishPending: ["Atividade pendente"],
    detail: { order: {}, equipment_links: [] },
  };
  let logoutRequested = false;
  const server = createServer(async (req, res) => {
    if (req.url === "/api/session" && req.method === "POST") {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      logoutRequested =
        JSON.parse(Buffer.concat(chunks).toString()).action === "logout";
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    const url = new URL(req.url!, "http://localhost");
    res.setHeader("Content-Type", "application/json");
    if (url.pathname.startsWith("/api/") && blocked) {
      res.statusCode = 402;
      res.end("This deployment is temporarily paused");
      return;
    }
    if (url.pathname === "/tecnico" || url.pathname.startsWith("/native/")) {
      const file =
        url.pathname === "/tecnico" ? "index.html" : url.pathname.slice(8);
      res.setHeader(
        "Content-Type",
        file.endsWith(".html")
          ? "text/html; charset=utf-8"
          : file.endsWith(".js")
            ? "text/javascript"
            : file.endsWith(".css")
              ? "text/css"
              : "application/octet-stream",
      );
      if (file.endsWith(".html")) res.setHeader("Content-Security-Policy", policy);
      res.end(readFileSync(path.join(assets, file)));
      return;
    }
    if (
      url.pathname === "/api/service-scheduling/photos" &&
      req.method === "POST"
    ) {
      for await (const chunk of req) {
        /* consume multipart photo */
      }
      receivedPhotos++;
      res.end(JSON.stringify({ id: "42" }));
      return;
    }
    if (url.pathname === "/api/field") {
      res.end(
        JSON.stringify(
          url.search
            ? detail
            : {
                email: "tech",
                displayName: "Técnico",
                rows: [row],
                active: null,
              },
        ),
      );
      return;
    }
    if (url.pathname === "/api/field/map") {res.end(JSON.stringify({technicians:[],orders:[]}));return;}
    if (url.pathname === "/api/field/time-requests") {
      res.end(
        JSON.stringify({
          fieldSessions: [],
          fieldEvents: [],
          operations: [],
          requests: [],
          events: [],
        }),
      );
      return;
    }
    res.end("{}");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const origin = "http://127.0.0.1:" + (server.address() as any).port;
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      permissions: ["geolocation"],
      geolocation: { latitude: -27, longitude: -49 },
    });
    await context.route("https://tile.openstreetmap.org/**", route => route.fulfill({
      contentType:"image/png",body:Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9s8AAAAASUVORK5CYII=","base64")
    }));
    await context.exposeBinding("sqliteCall", async (_source, call) => {
      if (call.action === "network") return internetOverride ?? !blocked;
      if (call.action === "location") return { timestamp: Date.now(), coords: { latitude: -27.2, longitude: -49.6, accuracy: 10 } };
      if (call.action === "launchOperation" || call.action === "permissions") return null;
      if (call.action === "read") {
        const row = sqlite
          .prepare("SELECT value FROM records WHERE key=?")
          .get(call.key);
        return row ? JSON.parse(String(row.value)) : null;
      }
      if (call.action === "write") {
        sqlite.exec("BEGIN");
        try {
          for (const [key, value] of call.entries) {
            if (value === null)
              sqlite.prepare("DELETE FROM records WHERE key=?").run(key);
            else
              sqlite
                .prepare("INSERT OR REPLACE INTO records VALUES(?,?)")
                .run(key, JSON.stringify(value));
          }
          sqlite.exec("COMMIT");
        } catch (e) {
          sqlite.exec("ROLLBACK");
          throw e;
        }
        return null;
      }
    });
    await context.addInitScript({
      content: `
      window.RJDatabase={postMessage:function(input){
        var call=JSON.parse(input);
        window.sqliteCall(call).then(function(value){window.RJDatabase.onmessage({data:JSON.stringify({id:call.id,value:value})});});
      }};
    `,
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => console.log("NATIVE PAGE", error.message));
    await page.goto(origin + "/tecnico");
    await expect(page.getByText("Portal Técnico RJ · Versão 2.2.3",{exact:true})).toBeVisible();
    await expect
      .poll(
        () =>
          page.evaluate(async () => {
            const native = (window as any).RJOffline;
            const result = native ? await native.message("FIELD_STATUS") : null;
            return !!result?.prepared;
          }),
        { timeout: 20000 },
      )
      .toBe(true);
    await page.getByRole("button",{name:"Programação",exact:false}).click();
    await page.getByRole("button",{name:"Mapa",exact:true}).click();
    await expect.poll(() => page.locator(".leaflet-tile-loaded").count()).toBeGreaterThan(0);
    assert.ok(await page.locator(".leaflet-tile-loaded").first().evaluate((img:HTMLImageElement) => img.naturalWidth > 0));
    await page.getByRole("button",{name:"Lista",exact:true}).click();
    await page.getByRole("button",{name:"Voltar ao menu",exact:true}).click();
    blocked = true;
    await page.evaluate(() => (window as any).RJOffline.message("FIELD_SYNC"));
    await expect(page.getByText("Sem internet", { exact: true })).toBeVisible();
    await page
      .getByRole("button", { name: "Programação", exact: false })
      .click();
    await page.getByText("OS 15025", { exact: true }).click();
    await page.getByRole("button", { name: /OP01/ }).click();
    const dialog = page.getByRole("dialog", { name: /OP01/ });
    await expect(
      dialog.getByText("Sem internet", { exact: true }),
    ).toBeVisible();
    await dialog
      .getByRole("button", { name: "Iniciar atividade", exact: false })
      .click({ timeout: 5000 });
    await expect(
      dialog.getByRole("button", {
        name: "Finalizar apontamento",
        exact: false,
      }),
    ).toBeVisible();
    const photoId = await page.evaluate(async (operationId) => {
      const form = new FormData();
      form.set(
        "file",
        new Blob(["native-photo-bytes"], { type: "image/png" }),
        "photo.png",
      );
      form.set("operationId", operationId);
      form.set("stageId", "s");
      form.set("fieldId", "photos");
      const response = await fetch("/api/service-scheduling/photos", {
        method: "POST",
        body: form,
      });
      if (response.status !== 202) throw Error("Photo not saved locally");
      return (await response.json()).id;
    }, id);
    const photoRecord = JSON.parse(
      String(
        sqlite
          .prepare("SELECT value FROM records WHERE key=?")
          .get("tech:photo:" + photoId)!.value,
      ),
    );
    const photoBytes = JSON.parse(
      String(
        sqlite
          .prepare("SELECT value FROM records WHERE key=?")
          .get("blob:" + photoRecord.file.__rjBlob)!.value,
      ),
    );
    assert.equal(
      Buffer.from(photoBytes, "base64").toString(),
      "native-photo-bytes",
    );
    await dialog
      .getByRole("button", { name: "Relatório", exact: true })
      .click();
    await dialog.getByText("01. Relatório técnico", { exact: false }).click();
    await dialog
      .getByRole("textbox", { name: "Serviço realizado" })
      .fill("Inspeção concluída sem conexão.");
    await dialog.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(
      dialog
        .getByText("Salvo no dispositivo. Aguardando sincronização.")
        .first(),
    ).toBeVisible();
    await page.reload();
    await page.getByRole("button", { name: /Sincronismo/ }).click();
    const sync = page.getByRole("dialog", { name: "Sincronismo", exact: true });
    await expect(
      sync.getByText("Relatório salvo", { exact: true }),
    ).toBeVisible();
    await expect(
      sync.getByText("Início de atividade", { exact: true }),
    ).toBeVisible();
    const colors = await sync.locator(".field-connection").evaluate((e) => ({
      color: getComputedStyle(e).color,
      background: getComputedStyle(e).backgroundColor,
    }));
    assert.equal(colors.color, "rgb(180, 35, 24)");
    assert.equal(colors.background, "rgb(253, 233, 232)");
    await page.screenshot({
      path: "test-results/field-offline-sync.png",
      fullPage: true,
    });
    assert.ok(
      sqlite.prepare("SELECT value FROM records WHERE key='tech:queue'").get(),
    );
    await page.close();
    sqlite.close();
    sqlite = new DatabaseSync(path.join(directory, "portal.db"));
    const reopened = await context.newPage();
    await reopened.goto(origin + "/tecnico");
    await expect(
      reopened.getByRole("button", { name: "Sincronismo", exact: true }),
    ).toBeVisible();
    await reopened
      .getByRole("button", { name: "Sincronismo", exact: true })
      .click();
    await expect(
      reopened.getByText("Relatório salvo", { exact: true }),
    ).toBeVisible();
    const queue = JSON.parse(
      String(
        sqlite
          .prepare("SELECT value FROM records WHERE key='tech:queue'")
          .get()!.value,
      ),
    );
    assert.ok(queue.length >= 2);
    internetOverride = true;
    await reopened.evaluate(() => window.dispatchEvent(new Event("rj-network-change")));
    await expect.poll(async () => (await reopened.evaluate(() => (window as any).RJOffline.message("FIELD_STATUS"))).connected).toBe(true);
    await expect(reopened.getByRole("dialog", {name:"Sincronismo",exact:true}).getByText("Conectado",{exact:true})).toBeVisible();
    internetOverride = false;
    await reopened.evaluate(() => window.dispatchEvent(new Event("rj-network-change")));
    await expect(reopened.getByRole("dialog", {name:"Sincronismo",exact:true}).getByText("Sem internet",{exact:true})).toBeVisible();
    internetOverride = true;
    await reopened.evaluate(() => window.dispatchEvent(new Event("rj-network-change")));
    await expect(reopened.getByRole("dialog", {name:"Sincronismo",exact:true}).getByText("Conectado",{exact:true})).toBeVisible();
    const unavailable = await reopened.evaluate(() => (window as any).RJOffline.message("FIELD_STATUS"));
    assert.equal(unavailable.serverConnected, false);
    blocked = false;
    await expect
      .poll(
        async () => {
          const result = await reopened.evaluate(() =>
            (window as any).RJOffline.message("FIELD_SYNC"),
          );
          if (!result.ok) console.log("SYNC", result.error);
          return JSON.parse(
            String(
              sqlite
                .prepare("SELECT value FROM records WHERE key='tech:queue'")
                .get()!.value,
            ),
          ).length;
        },
        { timeout: 15000 },
      )
      .toBe(0);
    assert.equal(receivedPhotos, 1);
    assert.ok(
      sqlite
        .prepare("SELECT value FROM records WHERE key='tech:photo:42'")
        .get(),
    );
  } finally {
    await browser.close();
    await new Promise<void>((r) => server.close(() => r()));
    sqlite.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
