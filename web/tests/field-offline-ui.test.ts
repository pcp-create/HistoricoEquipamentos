import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { build } from "esbuild";
import { chromium, expect } from "@playwright/test";
test("web portal is online-only and displays connectivity without preparing offline storage", async () => {
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
    await expect(page.getByText("Conectado", {exact:true})).toBeVisible();
    assert.equal(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length), 0);
    await expect(page.getByText(/Prepare este dispositivo/)).toHaveCount(0);
    await context.setOffline(true);
    await expect(page.getByText("Sem internet", { exact: true })).toBeVisible();
    await expect(page.getByText(/O portal web funciona somente online/)).toBeVisible();
    await page.getByRole("button", {name:"Sincronismo",exact:true}).click();
    const sync = page.getByRole("dialog", {name:"Sincronismo",exact:true});
    await expect(sync.getByText("Conexão e pendências anteriores")).toBeVisible();
    await expect(sync.getByRole("button",{name:"Baixar programação"})).toHaveCount(0);
    await sync.getByRole("button",{name:"Fechar sincronismo"}).click();
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
