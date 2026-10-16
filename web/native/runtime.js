// Runs only inside the packaged, origin-restricted Android WebView.
const networkFetch = window.fetch.bind(window);
const callbacks = new Map();
let sequence = 0;
window.RJDatabase.onmessage = (event) => {
  const result = JSON.parse(event.data),
    callback = callbacks.get(result.id);
  if (!callback) return;
  callbacks.delete(result.id);
  result.error
    ? callback.reject(Object.assign(Error(result.error), { code: result.errorCode }))
    : callback.resolve(result.value);
};
function nativeCall(action, payload) {
  return new Promise((resolve, reject) => {
    const id = String(++sequence);
    callbacks.set(id, { resolve, reject });
    window.RJDatabase.postMessage(JSON.stringify({ id, action, ...payload }));
  });
}
navigator.geolocation.getCurrentPosition = (success, failure, options = {}) => {
  nativeCall("location", { maximumAge: options.maximumAge ?? 30000, timeout: options.timeout ?? 30000 }).then(success, failure || (() => {}));
};
const blobIds = new WeakMap();
async function encode(value, blobs) {
  if (value instanceof Blob) {
    let id = blobIds.get(value);
    if (!id) {
      const bytes = new Uint8Array(await value.arrayBuffer());
      id = Array.from(
        new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
      )
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      let raw = "";
      for (let i = 0; i < bytes.length; i += 16384)
        raw += String.fromCharCode(...bytes.subarray(i, i + 16384));
      blobs.set("blob:" + id, btoa(raw));
    }
    return { __rjBlob: id, type: value.type };
  }
  if (Array.isArray(value))
    return Promise.all(value.map((v) => encode(v, blobs)));
  if (value && typeof value === "object")
    return Object.fromEntries(
      await Promise.all(
        Object.entries(value).map(async ([k, v]) => [
          k,
          await encode(v, blobs),
        ]),
      ),
    );
  return value;
}
async function decode(value) {
  if (value?.__rjBlob) {
    const encoded = await nativeCall("read", { key: "blob:" + value.__rjBlob });
    if (typeof encoded !== "string")
      throw Error(
        "Foto local não encontrada. Preserve os dados e solicite suporte.",
      );
    const raw = atob(encoded),
      bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    const blob = new Blob([bytes], { type: value.type });
    blobIds.set(blob, value.__rjBlob);
    return blob;
  }
  if (Array.isArray(value)) return Promise.all(value.map(decode));
  if (value && typeof value === "object")
    return Object.fromEntries(
      await Promise.all(
        Object.entries(value).map(async ([k, v]) => [k, await decode(v)]),
      ),
    );
  return value;
}
const nativeStorage = {
  read: async (key) => decode(await nativeCall("read", { key })),
  write: async (entries) => {
    const blobs = new Map();
    const packed = await Promise.all(
      entries.map(async ([key, value]) => [
        key,
        value === undefined ? null : await encode(value, blobs),
      ]),
    );
    // All blobs, queue entries and local projections are committed together in SQLite.
    await nativeCall("write", { entries: [...blobs, ...packed] });
  },
};
const handlers = {};
const client = {
  url: location.origin + "/tecnico",
  postMessage: () => window.dispatchEvent(new Event("rj-offline-update")),
};
const self = {
  nativeStorage,
  navigator,
  location,
  clients: { matchAll: async () => [client], get: async () => client },
  registration: {},
  addEventListener: (name, fn) => {
    handlers[name] = fn;
  },
};
const fetch = networkFetch;
// CORE is inserted here by the asset builder; the same queue logic serves web and Android.
/* INSERT_OFFLINE_CORE */
window.fetch = (input, init) => {
  const req = new Request(
    input instanceof Request ? input : new URL(input, location.href),
    init,
  );
  let response;
  handlers.fetch({
    request: req,
    clientId: "native",
    respondWith: (r) => (response = r),
    waitUntil: (p) => p.catch(() => {}),
  });
  return response || networkFetch(req);
};
window.RJOffline = {
  openPdf: (url) => nativeCall("openPdf", {url}),
  connection: () => nativeCall("network", {}),
  permissions: () => nativeCall("permissions", {}),
  launchOperation: () => nativeCall("launchOperation", {}),
  message: (type) =>
    new Promise((resolve) =>
      handlers.message({
        data: { type },
        ports: [{ postMessage: async (result) => { if (typeof result.connected === "boolean") { result.serverConnected = result.connected; result.connected = await nativeCall("network", {}); } resolve(result); } }],
        waitUntil: (p) => p.catch(() => {}),
      }),
    ),
  exportBackup: (data) => nativeCall("export", { data }),
};
