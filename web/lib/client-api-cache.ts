/** Per-tab, per-authenticated-user cache. Never used for server requests. */
const storageKey = "gestao-api-cache-v1";
const ttl = 60000;
const maxBytes = 12_000_000;
type Entry = { body: string; type: string; expires: number };
let scope = "",
  generation = 0;
const entries = new Map<string, Entry>();
const pending = new Map<string, Promise<Response>>();
const equipmentKey = "/api/equipment-management?all=1";
let equipmentEntry: Entry | undefined;
let equipmentGeneration = 0;
function currentScope() {
  if (typeof document === "undefined") return "";
  return (
    document.querySelector<HTMLMetaElement>('meta[name="app-cache-scope"]')
      ?.content || ""
  );
}
function persist() {
  let size = [...entries.values()].reduce((sum, e) => sum + e.body.length, 0);
  while ((size > maxBytes || entries.size > 40) && entries.size) {
    const key = entries.keys().next().value!;
    size -= entries.get(key)!.body.length;
    entries.delete(key);
  }
  try {
    const saved: [string, Entry][] = [];
    let stored = 0;
    for (const [key, e] of [...entries].reverse()) {
      if (stored + e.body.length > 2_000_000) continue;
      saved.push([key, e]);
      stored += e.body.length;
    }
    sessionStorage.setItem(
      storageKey,
      JSON.stringify({ scope, entries: saved.reverse() }),
    );
  } catch {
    /* Storage quota/privacy settings must never block the application. */
  }
}
function prepare() {
  const next = currentScope();
  if (next === scope) return;
  scope = next;
  equipmentEntry = undefined;
  equipmentGeneration++;
  entries.clear();
  pending.clear();
  generation++;
  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey) || "null");
    if (scope && saved?.scope === scope)
      for (const [url, e] of saved.entries || [])
        if (url !== equipmentKey && e.expires > Date.now()) entries.set(url, e);
  } catch {}
  persist();
}
export function clearApiCache(preserveEquipment = false) {
  entries.clear();
  if (!preserveEquipment) {
    equipmentEntry = undefined;
    equipmentGeneration++;
    pending.clear();
  } else {
    for (const key of pending.keys())
      if (key !== equipmentKey) pending.delete(key);
  }
  generation++;
  try {
    sessionStorage.removeItem(storageKey);
  } catch {}
}
function keyFor(input: string | URL | Request) {
  if (typeof window === "undefined") return null;
  const url = new URL(
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url,
    window.location.origin,
  );
  if (
    url.origin !== window.location.origin ||
    !url.pathname.startsWith("/api/")
  )
    return null;
  if (
    ["/api/session", "/api/activity", "/api/tasks/automation"].includes(
      url.pathname,
    ) ||
    url.pathname.includes("/attachments/")
  )
    return null;
  if (url.searchParams.has("export")) return null;
  url.searchParams.sort();
  return url.pathname + url.search;
}
export function cachedEquipmentList(): unknown | null {
  prepare();
  return scope && equipmentEntry ? JSON.parse(equipmentEntry.body) : null;
}
export function hasFreshApiResponse(url: string) {
  prepare();
  const key = keyFor(url);
  return Boolean(
    scope &&
    key &&
    (key === equipmentKey ? equipmentEntry : entries.get(key))?.expires! >
      Date.now(),
  );
}
function waitFor(
  promise: Promise<Response>,
  signal?: AbortSignal | null,
): Promise<Response> {
  if (!signal) return promise.then((r) => r.clone());
  if (signal.aborted)
    return Promise.reject(new DOMException("Aborted", "AbortError"));
  return new Promise((resolve, reject) => {
    const abort = () => {
      signal.removeEventListener("abort", abort);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", abort, { once: true });
    promise.then(
      (r) => {
        signal.removeEventListener("abort", abort);
        resolve(r.clone());
      },
      (e) => {
        signal.removeEventListener("abort", abort);
        reject(e);
      },
    );
  });
}
export async function apiFetch(
  input: string | URL | Request,
  init?: RequestInit,
): Promise<Response> {
  prepare();
  const method = (
    init?.method || (input instanceof Request ? input.method : "GET")
  ).toUpperCase();
  const key = keyFor(input);
  const activity = String(input).startsWith("/api/activity");
  const mutation = method !== "GET" && method !== "HEAD" && !activity;
  // Task changes never alter the equipment catalogue or preventive plans.
  const taskMutation =
    mutation &&
    Boolean(key && (key === "/api/tasks" || key.startsWith("/api/tasks/")));
  if (mutation) clearApiCache(taskMutation);
  if (
    !scope ||
    !key ||
    method !== "GET" ||
    input instanceof Request ||
    init?.headers ||
    init?.cache === "reload"
  ) {
    const r = await fetch(input, init);
    if (r.status === 401 || r.status === 403) clearApiCache();
    else if (mutation) clearApiCache(taskMutation);
    return r;
  }
  if (init?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const equipment = key === equipmentKey;
  const cached = equipment ? equipmentEntry : entries.get(key);
  if (cached && cached.expires > Date.now())
    return new Response(cached.body, {
      headers: { "Content-Type": cached.type },
    });
  const existing = pending.get(key);
  if (existing) return waitFor(existing, init?.signal);
  const version = equipment ? equipmentGeneration : generation;
  const unchanged = () =>
    version === (equipment ? equipmentGeneration : generation);
  const request = fetch(input, { ...init, signal: undefined })
    .then(async (r) => {
      if (r.status === 401 || r.status === 403) clearApiCache();
      const type = r.headers.get("content-type") || "";
      if (r.ok && type.includes("application/json") && unchanged()) {
        const body = await r.clone().text();
        if ((equipment || body.length <= maxBytes) && unchanged()) {
          const entry = {
            body,
            type,
            expires: equipment
              ? Number.POSITIVE_INFINITY
              : Date.now() + (key === "/api/admin" ? 15000 : ttl),
          };
          if (equipment) equipmentEntry = entry;
          else {
            entries.delete(key);
            entries.set(key, entry);
            persist();
          }
        }
      }
      return r;
    })
    .finally(() => {
      if (pending.get(key) === request) pending.delete(key);
    });
  pending.set(key, request);
  return waitFor(request, init?.signal);
}
