import { test } from "node:test";
import assert from "node:assert/strict";
import { apiFetch, clearApiCache } from "../lib/client-api-cache";
test("client cache reuses data, isolates identities, invalidates writes and respects independent cancellation", async () => {
  const g = globalThis as any,
    original = {
      fetch: g.fetch,
      window: g.window,
      document: g.document,
      sessionStorage: g.sessionStorage,
    };
  let user = "one",
    calls = 0;
  const storage = new Map();
  g.window = { location: { origin: "https://app.example" } };
  g.document = { querySelector: () => ({ content: user }) };
  g.sessionStorage = {
    getItem: (k: string) => storage.get(k),
    setItem: (k: string, v: string) => storage.set(k, v),
    removeItem: (k: string) => storage.delete(k),
  };
  g.fetch = async () => {
    calls++;
    return Response.json({ value: calls });
  };
  try {
    clearApiCache();
    assert.deepEqual(await (await apiFetch("/api/tasks")).json(), { value: 1 });
    assert.deepEqual(await (await apiFetch("/api/tasks")).json(), { value: 1 });
    assert.equal(calls, 1);
    await apiFetch("/api/tasks", { method: "POST", body: "{}" });
    await apiFetch("/api/tasks");
    assert.equal(calls, 3);
    user = "two";
    await apiFetch("/api/tasks");
    assert.equal(calls, 4);
    clearApiCache();
    let resolve!: (r: Response) => void;
    g.fetch = () => {
      calls++;
      return new Promise<Response>((r) => {
        resolve = r;
      });
    };
    const controller = new AbortController();
    const a = apiFetch("/api/tasks", { signal: controller.signal });
    const b = apiFetch("/api/tasks");
    controller.abort();
    await assert.rejects(a, { name: "AbortError" });
    resolve(Response.json({ ok: true }));
    assert.deepEqual(await (await b).json(), { ok: true });
    assert.equal(calls, 5);
    g.fetch = async () => {
      calls++;
      return new Response(null, { status: 401 });
    };
    await apiFetch("/api/other");
    await apiFetch("/api/tasks");
    assert.equal(calls, 7);
    clearApiCache();
    let now = Date.now();
    const oldNow = Date.now;
    Date.now = () => now;
    try {
      g.fetch = async () => {
        calls++;
        return Response.json({});
      };
      await apiFetch("/api/tasks");
      now += 61000;
      await apiFetch("/api/tasks");
      assert.equal(calls, 9);
      await apiFetch("/api/equipment-management?all=1");
      const initial = calls;
      now += 3600_000;
      await apiFetch("/api/tasks", {method:"POST",body:JSON.stringify({action:"sync"})});
      await apiFetch("/api/equipment-management?all=1");
      assert.equal(calls, initial + 1, "task sync must preserve the equipment list even after an hour");
      await apiFetch("/api/equipment-management", {method:"POST",body:"{}"});
      await apiFetch("/api/equipment-management?all=1");
      assert.equal(calls, initial + 3, "equipment writes invalidate the list");
      user="three";
      await apiFetch("/api/equipment-management?all=1");
      assert.equal(calls, initial + 4, "equipment list is isolated by user");
    } finally {
      Date.now = oldNow;
    }
  } finally {
    clearApiCache();
    Object.assign(g, original);
  }
});
