import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { build } from "esbuild";
import { chromium, expect } from "@playwright/test";
test("existing mobile portal starts activity and saves a report offline with a visible sync queue", async () => {
  const compiled = await build({
    stdin: {
      contents:
        "import React from 'react';import {createRoot} from 'react-dom/client';import FieldApp from './components/field-app';import './app/globals.css';createRoot(document.getElementById('root')).render(<FieldApp/>);",
      resolveDir: process.cwd(),
      loader: "tsx",
    },
    bundle: true,
    write: false,
    platform: "browser",
    jsx: "automatic",
    outfile: "app.js",
    loader: { ".png": "dataurl", ".svg": "dataurl" },
  });
  const js = compiled.outputFiles.find((f) => f.path.endsWith(".js"))!.text;
  const css = compiled.outputFiles.find((f) => f.path.endsWith(".css"))!.text;
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
      logoutRequested = JSON.parse(Buffer.concat(chunks).toString()).action === "logout";
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    const url = new URL(req.url!, "http://localhost");
    res.setHeader("Content-Type", "application/json");
    if (
      process.env.FIELD_PRODUCTION_ORIGIN &&
      !url.pathname.startsWith("/api/")
    ) {
      const upstream = await fetch(
        process.env.FIELD_PRODUCTION_ORIGIN + req.url,
        {
          headers: { cookie: "m8-access=offline-test-fixture" },
          redirect: "manual",
        },
      );
      res.statusCode = upstream.status;
      for (const name of [
        "content-type",
        "service-worker-allowed",
        "cache-control",
      ])
        if (upstream.headers.has(name))
          res.setHeader(name, upstream.headers.get(name)!);
      res.end(Buffer.from(await upstream.arrayBuffer()));
      return;
    }
    if (url.pathname === "/tecnico") {
      res.setHeader("Content-Type", "text/html");
      res.end(
        '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/_next/static/app.css"></head><body><div id="root"></div><script src="/_next/static/app.js"></script></body></html>',
      );
      return;
    }
    if (url.pathname.startsWith("/_next/static/")) {
      res.setHeader(
        "Content-Type",
        url.pathname.endsWith(".js") ? "text/javascript" : "text/css",
      );
      res.end(url.pathname.endsWith(".js") ? js : css);
      return;
    }
    if (url.pathname === "/field-offline/assets.json") {
      res.end(
        JSON.stringify({
          files: ["/_next/static/app.js", "/_next/static/app.css"],
        }),
      );
      return;
    }
    if (url.pathname.startsWith("/field-offline/")) {
      res.setHeader("Content-Type", "text/javascript");
      res.setHeader("Service-Worker-Allowed", "/");
      res.end(
        readFileSync(new URL("../public" + url.pathname, import.meta.url)),
      );
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
    const page = await context.newPage();
    await page.goto(origin + "/tecnico");
    await expect
      .poll(
        () =>
          page.evaluate(async () => {
            const worker = navigator.serviceWorker.controller;
            if (!worker) return false;
            return new Promise<boolean>((r) => {
              const c = new MessageChannel();
              c.port1.onmessage = (e) => r(!!e.data.prepared);
              worker.postMessage({ type: "FIELD_STATUS" }, [c.port2]);
            });
          }),
        { timeout: 20000 },
      )
      .toBe(true);
    await context.setOffline(true);
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
    await sync.getByRole("button", { name: "Fechar sincronismo" }).click();
    await page.getByRole("button", { name: "Sair", exact: true }).click();
    await expect(page.getByText(/Conecte à internet para sair/)).toBeVisible();
    assert.equal(logoutRequested, false);
    await context.setOffline(false);
    await page.getByRole("button", { name: "Sair", exact: true }).click();
    await page.waitForURL("**/tecnico/entrar");
    assert.equal(logoutRequested, true);
  } finally {
    await browser.close();
    await new Promise<void>((r) => server.close(() => r()));
  }
});
