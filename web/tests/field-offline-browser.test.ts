import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";
const op = "10000000-0000-4000-8000-000000000001",otherOp="20000000-0000-4000-8000-000000000002";
test("durable offline queue preserves photos and reports across reload, then replays in order without duplicates", async () => {
  let blocked = false,
    conflict = false,
    owner = "tech",
    actions: any[] = [];
  let dropResponse = true;
  let releasePhoto: () => void = () => {};
  let photoStartedResolve: () => void = () => {};
  const photoStarted = new Promise<void>((resolve) => {
    photoStartedResolve = resolve;
  });
  const receipts = new Set<string>();
  const home = () => ({
    email: owner,
    displayName: "Técnico",
    rows: [op,otherOp].map(id=>({id,version:1,status:"awaiting_execution"})),
    active: null,
  });
  const detail = (id=op) => ({
    operation: {
      id,
      version: 1,
      document: {
        responsible: "tech",
        checklistId: "c",
        checklistRun: {
          template: { stages: [] },
          stages: { s: { status: "released", answers: {} } },
        },
      },
    },
    checked: true,
    infoRead: true,
    progress: {},
    materials: { complete: true, items: [] },
    settings: {
      document: {
        pauseReasons: [{ id: "gate", name: "Portaria", minutes: 15 }],
      },
    },
    history: [],
  });
  const server = createServer(async (req, res) => {
    if (blocked && req.url?.startsWith("/api/")) {
      res.destroy();
      return;
    }
    res.setHeader("Content-Type", "application/json");
    const url = new URL(req.url!, "http://localhost");
    if (url.pathname === "/field-offline/assets.json") {
      res.end(JSON.stringify({ files: [] }));
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
    if (url.pathname === "/tecnico") {
      res.setHeader("Content-Type", "text/html");
      res.end("<!doctype html><html><body>Portal técnico</body></html>");
      return;
    }
    if (req.method === "POST") {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      if (url.pathname === "/api/service-scheduling/photos") {
        photoStartedResolve();
        await new Promise<void>((resolve) => {
          releasePhoto = resolve;
          setTimeout(resolve, 15000).unref();
        });
        actions.push({
          action: "photo",
          content: Buffer.concat(chunks).toString(),
        });
        res.end(JSON.stringify({ id: "42" }));
        return;
      }
      if (url.pathname === "/api/session") {
        owner = "other";
        res.end("{}");
        return;
      }
      const body = JSON.parse(Buffer.concat(chunks).toString());
      if (conflict && body.operationId===op) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: "Conflito: operação alterada." }));
        return;
      }
      if (!receipts.has(body.requestId)) {
        receipts.add(body.requestId);
        actions.push(body);
      }
      if (dropResponse) {
        dropResponse = false;
        res.destroy();
        return;
      }
      res.end(JSON.stringify({ saved: true }));
      return;
    }
    if (url.pathname === "/api/field/time-requests") {
      res.end(
        JSON.stringify({
          fieldSessions: [],
          fieldEvents: [],
          operations: [],
          events: [],
          requests: [],
        }),
      );
      return;
    }
    res.end(
      JSON.stringify(
        url.search ? detail(url.searchParams.get("operation")||op) : url.pathname === "/api/field" ? home() : {},
      ),
    );
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const origin = "http://127.0.0.1:" + (server.address() as any).port;
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(origin + "/tecnico");
    await page.evaluate(async () => {
      await navigator.serviceWorker.register("/field-offline/sw.js", {
        scope: "/",
      });
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller)
        await new Promise((r) =>
          navigator.serviceWorker.addEventListener("controllerchange", r, {
            once: true,
          }),
        );
    });
    const message = (type: string) =>
      page.evaluate(
        (type) =>
          new Promise<any>((resolve) => {
            const c = new MessageChannel();
            c.port1.onmessage = (e) => resolve(e.data);
            navigator.serviceWorker.controller!.postMessage({ type }, [
              c.port2,
            ]);
          }),
        type,
      );
    await page.evaluate(() => fetch("/api/field"));
    assert.equal((await message("FIELD_PREPARE")).ok, true);
    blocked = true;
    await context.setOffline(true);
    const action = (body: any) =>
      page.evaluate(async (body) => {
        const r = await fetch("/api/field", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...body,
            operationId: body.operationId || "10000000-0000-4000-8000-000000000001",
            requestId: body.requestId || crypto.randomUUID(),
            location: {
              latitude: -27,
              longitude: -49,
              accuracy: 10,
              at: new Date().toISOString(),
            },
          }),
        });
        return { status: r.status, body: await r.json() };
      }, body);
    const start = crypto.randomUUID();
    assert.equal(
      (await action({ action: "start_work", requestId: start })).status,
      202,
    );
    assert.equal(
      (await page.evaluate(() => fetch("/api/field").then((r) => r.json())))
        .active.id,
      start,
    );
    const local = await page.evaluate(async () => {
      const f = new FormData();
      f.set(
        "file",
        new Blob(["image-bytes"], { type: "image/jpeg" }),
        "photo.jpg",
      );
      f.set("operationId", "10000000-0000-4000-8000-000000000001");
      f.set("stageId", "s");
      f.set("fieldId", "photos");
      return (
        await fetch("/api/service-scheduling/photos", {
          method: "POST",
          body: f,
        }).then((r) => r.json())
      ).id;
    });
    assert.match(local, /^local-/);
    assert.equal(
      (
        await action({
          action: "report_save",
          stages: [
            {
              stageId: "s",
              answers: { text: "Relatório sem rede", photos: [local] },
            },
          ],
        })
      ).status,
      202,
    );
    assert.equal(
      (await action({ action: "stop", sessionId: start })).status,
      202,
    );
    await page.reload();
    assert.match(await page.locator("body").innerText(), /Portal técnico/);
    assert.equal((await message("FIELD_STATUS")).pending, 4);
    const saved = await page.evaluate(
      (op) => fetch("/api/field?operation=" + op).then((r) => r.json()),
      op,
    );
    assert.equal(
      saved.operation.document.checklistRun.stages.s.answers.text,
      "Relatório sem rede",
    );
    assert.equal(
      await page.evaluate(
        (local) =>
          fetch("/api/service-scheduling/photos/" + local).then((r) =>
            r.text(),
          ),
        local,
      ),
      "image-bytes",
    );
    const logs = await page.evaluate(() =>
      fetch("/api/field/time-requests").then((r) => r.json()),
    );
    assert.equal(logs.fieldSessions[0].state, "finished");
    const backup = await message("FIELD_EXPORT");
    assert.equal(backup.backup.queue.length, 4);
    assert.equal(
      Buffer.from(backup.backup.queue[1].file.base64, "base64").toString(),
      "image-bytes",
    );
    assert.equal(actions.length, 0);
    blocked = false;
    await context.setOffline(false);
    const syncing = message("FIELD_SYNC");
    const retry = setInterval(() => {
      void message("FIELD_SYNC");
    }, 200);
    try {
      await photoStarted;
    } finally {
      clearInterval(retry);
    }
    const savedWhileUploading = await Promise.race([
      action({ action: "info_read" }),
      new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(Error("Photo upload blocked local action")),
          2000,
        ).unref();
      }),
    ]);
    assert.equal(savedWhileUploading.status, 202);
    releasePhoto();
    await syncing;
    assert.equal((await message("FIELD_SYNC")).pending, 0);
    assert.deepEqual(
      actions.map((a) => a.action),
      ["start_work", "photo", "report_save", "stop", "info_read"],
    );
    assert.deepEqual(actions[2].stages[0].answers.photos, ["42"]);
    assert.equal(actions[3].sessionId, start);
    await message("FIELD_SYNC");
    assert.equal(actions.length, 5);
    // Server conflicts remain queued and visible after a restart.
    conflict = true;
    await action({ action: "start_work" });
    await message("FIELD_SYNC");
    let state = await message("FIELD_STATUS");
    assert.equal(state.pending, 1);
    assert.match(state.queue[0].error, /Conflito/);
    await page.reload();
    assert.equal((await message("FIELD_STATUS")).pending, 1);
    // A failed operation must not block independent work, but its own chain stays pending.
    await action({action:"info_read"});
    await action({action:"info_read",operationId:otherOp});
    await message("FIELD_SYNC");
    state=await message("FIELD_STATUS");
    assert.equal(state.pending,2);
    assert.equal(actions.at(-1).operationId,otherOp);
    assert.equal(actions.at(-1).action,"info_read");
    // Logging into another account must not replay the previous user's data.
    await page.evaluate(() =>
      fetch("/api/session", { method: "POST", body: "{}" }),
    );
    assert.equal((await message("FIELD_STATUS")).pending, 0);
    await page.evaluate(() => fetch("/api/field"));
    state = await message("FIELD_STATUS");
    assert.equal(state.owner, "other");
    assert.equal(state.pending, 0);
    assert.equal(actions.length, 6);
  } finally {
    releasePhoto();
    await browser.close();
    await new Promise<void>((r) => server.close(() => r()));
  }
});
