/* Offline technician portal. Queue writes and projections commit atomically. */
importScripts("/field-offline/project.js");
const DB = "rj-field-offline-v1",
  ASSETS = "rj-field-assets-v1";
let serial = Promise.resolve(),
  flushing = null, syncingId = null;
const exclusive = (fn) => {
  const next = serial.then(fn, fn);
  serial = next.catch(() => {});
  return next;
};
const json = (v, status = 200) =>
  new Response(JSON.stringify(v), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
function db() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () =>
      r.result.createObjectStore("records", { keyPath: "key" });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function read(key) {
  if (self.nativeStorage) return self.nativeStorage.read(key);
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction("records"),
      r = t.objectStore("records").get(key);
    r.onsuccess = () => resolve(r.result?.value);
    r.onerror = () => reject(r.error);
    t.oncomplete = () => d.close();
  });
}
async function write(entries) {
  if (self.nativeStorage) return self.nativeStorage.write(entries);
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction("records", "readwrite"),
      s = t.objectStore("records");
    for (const [key, value] of entries)
      value === undefined ? s.delete(key) : s.put({ key, value });
    t.oncomplete = () => {
      d.close();
      resolve();
    };
    t.onabort = () => {
      d.close();
      reject(t.error || Error("Não foi possível salvar no dispositivo."));
    };
  });
}
const key = (owner, url) => owner + ":cache:" + url;
async function request(url, init = {}) {
  return fetch(url, {
    ...init,
    cache: "no-store",
    credentials: "same-origin",
    signal: AbortSignal.timeout(15000),
  });
}
async function notify() {
  for (const c of await self.clients.matchAll({ type: "window" }))
    c.postMessage({ type: "field-offline-update" });
}
async function registerSync() {
  try {
    await self.registration.sync?.register("rj-field-sync");
  } catch {}
}
function replaceIds(value, mapping) {
  if (typeof value === "string") return mapping[value] || value;
  if (Array.isArray(value)) return value.map((v) => replaceIds(v, mapping));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, replaceIds(v, mapping)]),
    );
  return value;
}
async function status() {
  const owner = await read("owner"),
    queue = owner ? (await read(owner + ":queue")) || [] : [];
  return {
    owner,
    syncing: !!flushing,
    syncingId,
    connected:
      self.navigator.onLine !== false && (await read("connected")) === true,
    pending: queue.length,
    queue: queue.map((q) => ({
      id: q.id,
      action: q.type === "photo" ? "Foto / assinatura" : q.body.action,
      operationId: q.operationId,
      operationLabel: q.operationLabel,
      at: q.at,
      error: q.error,
    })),
    lastSync: owner ? await read(owner + ":lastSync") : null,
    prepared: owner ? await read(owner + ":prepared") : null,
  };
}
async function cacheGet(url) {
  const owner = await read("owner");
  // A pending projection must not be replaced by stale server state.
  if (
    owner &&
    (((await read(owner + ":queue")) || []).length ||
      (await read(owner + ":unrefreshed")))
  ) {
    const saved = await read(key(owner, url));
    if (saved) return json(saved);
  }
  try {
    const response = await request(url);
    if (response.status === 401 || response.status === 403) return response;
    if (!response.ok) throw Error("Servidor indisponível.");
    const body = await response.clone().json();
    const identity = url === "/api/field" ? body.email : owner;
    if (identity) {
      const pending = (await read(identity + ":queue")) || [];
      if (url === "/api/field" && pending.length) {
        const projected = await read(key(identity, url));
        await write([
          ["owner", identity],
          ["connected", true],
        ]);
        if (projected) return json(projected);
      }
      await write([
        ["owner", identity],
        [key(identity, url), body],
        ["connected", true],
      ]);
    }
    return response;
  } catch {
    await write([["connected", false]]);
    const saved = owner ? await read(key(owner, url)) : null;
    return saved
      ? json(saved)
      : json(
          {
            error:
              "Esta informação ainda não foi baixada. Conecte à internet e prepare o dispositivo.",
          },
          503,
        );
  }
}
function operationLabel(home, id) {
  const row =
    home?.rows?.find((r) => r.id === id) ||
    home?.calendarRows?.find((r) => r.id === id);
  return row?.number
    ? "OS " + row.number + " / OP" + String(row.position || 1).padStart(2, "0")
    : "Operação " + id.slice(0, 8);
}
async function enqueue(req) {
  const owner = await read("owner");
  if (!owner)
    return json(
      { error: "Entre no portal com internet antes de usar o modo offline." },
      401,
    );
  const queue = (await read(owner + ":queue")) || [];
  const url = new URL(req.url);
  const heads =
    queue.length || (await read(owner + ":unrefreshed"))
      ? (await read(owner + ":heads")) || {}
      : {};
  let item,
    entries = [
      [owner + ":heads", heads],
      [owner + ":unrefreshed", true],
    ];
  if (url.pathname === "/api/service-scheduling/photos") {
    const form = await req.formData(),
      file = form.get("file"),
      operationId = String(form.get("operationId"));
    const home = await read(key(owner, "/api/field"));
    if (!file || file.size > 3 * 1024 * 1024)
      return json({ error: "Foto limitada a 3 MB após conversão." }, 400);
    if (
      home?.active?.operation_id !== operationId ||
      home.active.kind !== "work" ||
      home.active.state !== "running"
    )
      return json(
        { error: "Inicie ou retome a atividade antes de anexar fotos." },
        400,
      );
    const id = crypto.randomUUID(),
      local = "local-" + id;
    item = {
      id,
      type: "photo",
      operationLabel: operationLabel(home, operationId),
      at: new Date().toISOString(),
      operationId,
      stageId: form.get("stageId"),
      fieldId: form.get("fieldId"),
      file,
      name: file.name,
    };
    entries.push([owner + ":photo:" + local, { file, name: file.name }]);
    queue.push(item);
    await write([...entries, [owner + ":queue", queue]]);
    await registerSync();
    void sync().catch(() => {});
    await notify();
    return json({ id: local, queued: true }, 202);
  }
  if (url.pathname === "/api/field/time-requests") {
    const body = await req.json();
    if (body.action !== "request")
      return json({ error: "Esta ação exige conexão." }, 400);
    body.offline = { capturedAt: new Date().toISOString(), owner };
    queue.push({
      id: body.requestId,
      type: "time-request",
      operationId: body.operationId,
      at: body.offline.capturedAt,
      body,
    });
    await write([...entries, [owner + ":queue", queue]]);
    await registerSync();
    void sync().catch(() => {});
    await notify();
    return json({ ok: true, queued: true }, 202);
  }
  const body = await req.json(),
    home = await read(key(owner, "/api/field")),
    detail = await read(key(owner, "/api/field?operation=" + body.operationId));
  if (!home || !detail)
    return json(
      {
        error: "Baixe os detalhes da operação antes de trabalhar sem internet.",
      },
      409,
    );
  if (queue.some((q) => q.id === body.requestId))
    return json({ saved: true, queued: true }, 202);
  const previous = [...queue]
    .reverse()
    .find((q) => q.type === "action" && q.operationId === body.operationId);
  if (body.version !== undefined && body.version !== detail.operation.version)
    return json(
      {
        error:
          "O relatório foi atualizado. Reabra antes de salvar; o rascunho atual ainda está na tela.",
      },
      409,
    );
  const previousId = previous?.id || heads[body.operationId];
  body.offline = {
    owner,
    capturedAt: new Date().toISOString(),
    baseVersion: detail.operation.version,
    ...(previousId ? { previousRequestId: previousId } : {}),
  };
  item = {
    id: body.requestId,
    type: "action",
    operationId: body.operationId,
    at: body.offline.capturedAt,
    operationLabel: operationLabel(home, body.operationId),
    body,
  };
  let projection;
  try {
    projection = projectField(home, detail, body);
  } catch (e) {
    return json({ error: e.message }, 400);
  }
  if (
    ["start_work", "start_travel", "pause", "resume", "stop"].includes(
      body.action,
    )
  ) {
    const logs = (await read(key(owner, "/api/field/time-requests"))) || {
      fieldSessions: [],
      fieldEvents: [],
      operations: [],
      events: [],
      requests: [],
      timeAdjustmentsAvailable: false,
    };
    const session = projection.session;
    if (session) {
      logs.fieldSessions = [
        { ...session, display_name: home.displayName },
        ...(logs.fieldSessions || []).filter((s) => s.id !== session.id),
      ];
      logs.fieldEvents = [
        ...(logs.fieldEvents || []),
        {
          id: body.requestId,
          operation_id: body.operationId,
          actor: owner,
          action: body.action,
          created_at: body.offline.capturedAt,
          ...body.location,
          located_at: body.location.at,
          document: { sessionId: session.id, reason: session.pause_reason },
        },
      ];
    }
    if (!logs.operations.some((op) => op.id === body.operationId))
      logs.operations.push(detail.operation);
    entries.push([key(owner, "/api/field/time-requests"), logs]);
  }
  queue.push(item);
  await write([
    ...entries,
    [owner + ":queue", queue],
    [key(owner, "/api/field"), home],
    [key(owner, "/api/field?operation=" + body.operationId), detail],
  ]);
  await registerSync();
  void sync().catch(() => {});
  await notify();
  return json({ saved: true, queued: true }, 202);
}
async function flush() {
  const owner = await read("owner");
  if (!owner) return;
  try {
    while (true) {
      const identity = await request("/api/field");
      await write([["connected", identity.ok]]);
      if (!identity.ok)
        throw Error(
          identity.status === 401
            ? "Entre novamente para sincronizar."
            : "Não foi possível acessar o sistema.",
        );
      const home = await identity.json();
      if (home.email !== owner || (await read("owner")) !== owner)
        throw Error("Entre com a conta que criou os registros pendentes.");
      let item = ((await read(owner + ":queue")) || [])[0];
      while (item) {
        if ((await read("owner")) !== owner)
          throw Error(
            "A conta foi alterada. Entre novamente com a conta das pendências.",
          );
        syncingId=item.id;
        await notify();
        const mapping = (await read(owner + ":mapping")) || {};
        let result;
        if (item.type === "photo") {
          const form = new FormData();
          form.set("file", item.file, item.name);
          form.set("operationId", item.operationId);
          form.set("stageId", item.stageId);
          form.set("fieldId", item.fieldId);
          form.set("requestId", item.id);
          form.set("offlineOwner", owner);
          result = await request("/api/service-scheduling/photos", {
            method: "POST",
            body: form,
          });
        } else
          result = await request(
            item.type === "time-request"
              ? "/api/field/time-requests"
              : "/api/field",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(replaceIds(item.body, mapping)),
            },
          );
        const data = await result.json();
        if (!result.ok) {
          await exclusive(async () => {
            const queue = (await read(owner + ":queue")) || [];
            const pending = queue.find((q) => q.id === item.id);
            if (pending) pending.error = data.error || "Falha ao sincronizar.";
            await write([[owner + ":queue", queue]]);
          });
          await notify();
          if (result.status >= 500) {
            await write([["connected", false]]);
            throw Error(data.error || "Sistema indisponível.");
          }
          return;
        }
        // Merge acknowledgements into the CURRENT queue, never the pre-upload snapshot.
        // A technician may have saved more work while a large photo was uploading.
        await exclusive(async () => {
          const queue = (await read(owner + ":queue")) || [],
            heads = (await read(owner + ":heads")) || {};
          const currentMapping = (await read(owner + ":mapping")) || {};
          if (item.type === "photo")
            currentMapping["local-" + item.id] = data.id;
          if (item.type === "action") heads[item.operationId] = item.id;
          const photoEntries = [];
          if (item.type === "photo" && data.id) {
            const localPhoto = await read(owner + ":photo:local-" + item.id);
            if (localPhoto)
              photoEntries.push([owner + ":photo:" + data.id, localPhoto]);
          }
          await write([
            ...photoEntries,
            [owner + ":queue", queue.filter((q) => q.id !== item.id)],
            [owner + ":heads", heads],
            [owner + ":mapping", currentMapping],
            [owner + ":lastSync", new Date().toISOString()],
          ]);
        });
        await notify();
        item = ((await read(owner + ":queue")) || [])[0];
      }
      // Fetch a coherent replacement while local edits remain available.
      const latestResponse = await request("/api/field");
      if (!latestResponse.ok)
        throw Error("Não foi possível atualizar a programação.");
      const latest = await latestResponse.json();
      if (latest.email !== owner || (await read("owner")) !== owner)
        throw Error("Conta alterada.");
      const snapshots = [[key(owner, "/api/field"), latest]];
      for (const row of latest.calendarRows || latest.rows || []) {
        const url = "/api/field?operation=" + row.id,
          response = await request(url);
        if (!response.ok)
          throw Error("Não foi possível atualizar uma operação.");
        snapshots.push([key(owner, url), await response.json()]);
      }
      const logs = await request("/api/field/time-requests");
      if (logs.ok)
        snapshots.push([
          key(owner, "/api/field/time-requests"),
          await logs.json(),
        ]);
      const committed = await exclusive(async () => {
        if ((await read("owner")) !== owner) return false;
        if (((await read(owner + ":queue")) || []).length) return false;
        await write([
          ...snapshots,
          [owner + ":unrefreshed", false],
          ["connected", true],
        ]);
        return true;
      });
      if (committed) {
        await notify();
        return;
      }
      if ((await read("owner")) !== owner) return;
      // More work arrived during refresh: send it before replacing any local state.
    }
  } catch (e) {
    const networkError = ["TypeError", "TimeoutError", "AbortError"].includes(
      e.name,
    );
    if (networkError) await write([["connected", false]]);
    await exclusive(async () => {
      const queue = (await read(owner + ":queue")) || [];
      if (queue.length) {
        queue[0].error = networkError
          ? "Sem conexão. O envio será retomado automaticamente."
          : e.message;
        await write([[owner + ":queue", queue]]);
        await registerSync();
      }
    });
    await notify();
    throw e;
  }
}
function sync() {
  if (!flushing)
    flushing = flush().finally(() => {
      flushing = null, syncingId = null;
    });
  return flushing;
}
async function preparedCache(owner, url, body) {
  await exclusive(async () => {
    if ((await read("owner")) !== owner)
      throw Error("Conta alterada. Reabra o portal.");
    if (
      ((await read(owner + ":queue")) || []).length ||
      (await read(owner + ":unrefreshed"))
    )
      throw Error(
        "Um registro foi salvo durante o download. Sincronize e baixe a programação novamente.",
      );
    await write([[key(owner, url), body]]);
  });
}
async function prepare() {
  const owner = await read("owner");
  if (!owner) throw Error("Entre no portal primeiro.");
  if (((await read(owner + ":queue")) || []).length)
    throw Error(
      "Sincronize os registros pendentes antes de atualizar a programação.",
    );
  const homeResponse = await request("/api/field");
  if (!homeResponse.ok) throw Error("Sem conexão com o sistema.");
  const home = await homeResponse.json();
  if (home.email !== owner) throw Error("Conta alterada. Reabra o portal.");
  await preparedCache(owner, "/api/field", home);
  for (const row of home.calendarRows || home.rows) {
    const url = "/api/field?operation=" + row.id,
      response = await request(url);
    if (!response.ok)
      throw Error("Não foi possível baixar a operação " + row.id);
    const detail = await response.json();
    await preparedCache(owner, url, detail);

    if (detail.operation.document.equipmentId)
      await cacheGet(
        "/api/service-scheduling/equipment?reading=" +
          encodeURIComponent(detail.operation.document.equipmentId),
      );
    const ids = new Set();
    function collect(v, k) {
      if (
        Array.isArray(v) &&
        v.every((x) => typeof x === "string" && /^\d+$/.test(x))
      )
        v.forEach((x) => ids.add(x));
      else if (v && typeof v === "object")
        for (const [key, value] of Object.entries(v)) collect(value, key);
    }
    collect(detail.operation.document.checklistRun);
    for (const id of ids) {
      try {
        await photo("/api/service-scheduling/photos/" + id);
      } catch {}
    }
  }
  for (const url of ["/api/field/time-requests", "/api/field/map"])
    await cacheGet(url);
  if (!self.nativeStorage) {
    const shell = await request("/tecnico");
    if (!shell.ok || new URL(shell.url).pathname != "/tecnico")
      throw Error("Entre novamente antes de preparar o dispositivo.");
    const html = await shell.clone().text(),
      assets = await caches.open(ASSETS);
    await write([[owner + ":shell", html]]);
    const paths = new Set();
    for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
      const path = match[1].replaceAll("&amp;", "&");
      if (path.startsWith("/_next/static/") || path.startsWith("/icons/"))
        paths.add(path);
    }
    // Includes lazy chunks (map, signature inputs) and fonts for a cold offline launch.
    const manifest = await request("/field-offline/assets.json");
    if (manifest.ok) {
      const body = await manifest.json();
      for (const path of body.files || [])
        if (path.startsWith("/_next/static/")) paths.add(path);
    }
    const pending = [...paths];
    for (let i = 0; i < pending.length; i += 4)
      await Promise.all(
        pending.slice(i, i + 4).map(async (path) => {
          if (await assets.match(path)) return;
          const asset = await request(path);
          if (!asset.ok)
            throw Error("Falha ao baixar a interface. Tente novamente.");
          await assets.put(path, asset);
        }),
      );
  }
  if ((await read("owner")) !== owner)
    throw Error("Conta alterada. Reabra o portal.");
  await write([
    [owner + ":prepared", new Date().toISOString()],
    ["connected", true],
  ]);
  await notify();
}
async function photo(url) {
  const owner = await read("owner");
  if (!owner) return new Response("", { status: 401 });
  const id = url.split("/").pop();
  if (id.startsWith("local-")) {
    const p = await read(owner + ":photo:" + id);
    return p
      ? new Response(p.file, { headers: { "Content-Type": p.file.type } })
      : new Response("", { status: 404 });
  }
  try {
    const r = await request(url);
    if (!r.ok) throw Error("Foto indisponível no servidor.");
    const blob = await r.clone().blob();
    await write([[owner + ":photo:" + id, { file: blob }]]);
    return r;
  } catch {
    const p = await read(owner + ":photo:" + id);
    return p
      ? new Response(p.file, { headers: { "Content-Type": p.file.type } })
      : new Response("", { status: 503 });
  }
}
self.addEventListener("install", (event) =>
  event.waitUntil(self.skipWaiting()),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);
self.addEventListener("sync", (event) => {
  if (event.tag === "rj-field-sync") event.waitUntil(sync());
});
self.addEventListener("message", (event) => {
  const { type } = event.data || {};
  event.waitUntil(
    (async () => {
      try {
        if (type === "FIELD_PREPARE") {
          await sync();
          await prepare();
        }
        if (type === "FIELD_SYNC") await sync();
        if (type === "FIELD_EXPORT") {
          const owner = await read("owner"),
            queue = owner ? (await read(owner + ":queue")) || [] : [];
          const exported = [];
          for (const item of queue) {
            if (item.type !== "photo") {
              exported.push(item);
              continue;
            }
            const bytes = new Uint8Array(await item.file.arrayBuffer());
            let binary = "";
            for (let i = 0; i < bytes.length; i += 16384)
              binary += String.fromCharCode(...bytes.subarray(i, i + 16384));
            exported.push({
              ...item,
              file: {
                name: item.name,
                type: item.file.type,
                base64: btoa(binary),
              },
            });
          }
          event.ports[0]?.postMessage({
            ok: true,
            backup: {
              format: "rj-field-offline-v1",
              owner,
              exportedAt: new Date().toISOString(),
              queue: exported,
              mapping: (await read(owner + ":mapping")) || {},
            },
          });
          return;
        }
        event.ports[0]?.postMessage({ ok: true, ...(await status()) });
      } catch (e) {
        event.ports[0]?.postMessage({
          ok: false,
          error: e.message,
          ...(await status()),
        });
      }
    })(),
  );
});
self.addEventListener("fetch", (event) => {
  const req = event.request,
    url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === "/api/session" && req.method === "POST") {
    event.respondWith(
      (async () => {
        return exclusive(async () => {
          const r = await fetch(req);
          if (r.ok) await write([["owner", undefined]]);
          return r;
        });
      })(),
    );
    return;
  }
  if (req.mode === "navigate" && url.pathname === "/tecnico") {
    event.respondWith(
      (async () => {
        try {
          const r = await request(req);
          if (r.ok && new URL(r.url).pathname === "/tecnico") return r;
          if (r.status < 500) return r;
          throw Error();
        } catch {
          const owner = await read("owner"),
            html = owner ? await read(owner + ":shell") : null;
          return html
            ? new Response(html, {
                headers: { "Content-Type": "text/html; charset=utf-8" },
              })
            : new Response(
                "Conecte à internet para entrar e preparar o dispositivo para uso offline.",
                {
                  status: 503,
                  headers: { "Content-Type": "text/plain; charset=utf-8" },
                },
              );
        }
      })(),
    );
    return;
  }
  if (req.method === "GET" && url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      (async () => {
        const c = await caches.open(ASSETS),
          saved = await c.match(req);
        if (saved) return saved;
        const r = await fetch(req);
        if (r.ok) await c.put(req, r.clone());
        return r;
      })(),
    );
    return;
  }
  // Only requests from the technician portal use its durable queue.
  event.respondWith(
    (async () => {
      const client = await self.clients.get(event.clientId);
      if (!client || new URL(client.url).pathname != "/tecnico")
        return fetch(req);
      if (
        req.method === "POST" &&
        (url.pathname === "/api/field" ||
          url.pathname === "/api/service-scheduling/photos" ||
          url.pathname === "/api/field/time-requests")
      ) {
        let result;
        try {
          result = await exclusive(() => enqueue(req));
        } catch (error) {
          return json(
            {
              error:
                error.name === "QuotaExceededError"
                  ? "O armazenamento do aparelho está cheio. Libere espaço e salve novamente."
                  : "Não foi possível salvar no dispositivo. Mantenha a tela aberta e tente novamente.",
            },
            507,
          );
        }
        event.waitUntil(sync().catch(() => {}));
        return result;
      }
      if (
        req.method === "GET" &&
        url.pathname.startsWith("/api/service-scheduling/photos/")
      )
        return photo(url.pathname);
      if (
        req.method === "GET" &&
        (url.pathname === "/api/field" ||
          url.pathname === "/api/field/map" ||
          url.pathname === "/api/field/time-requests" ||
          url.pathname === "/api/service-scheduling/equipment")
      )
        return exclusive(() => cacheGet(url.pathname + url.search));
      return fetch(req);
    })(),
  );
});
