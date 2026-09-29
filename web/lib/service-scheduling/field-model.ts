export function validatePauseReasons(raw: any) {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > 100)
    throw Error("Causas de pausa inválidas.");
  const ids = new Set(),
    names = new Set();
  return raw.map((r) => {
    if (
      !r ||
      typeof r.id !== "string" ||
      !/^[a-zA-Z0-9_-]{1,100}$/.test(r.id) ||
      typeof r.name !== "string" ||
      !r.name.trim() ||
      r.name.length > 160 ||
      ids.has(r.id) ||
      names.has(r.name.trim().toLowerCase())
    )
      throw Error("Informe causas de pausa distintas.");
    ids.add(r.id);
    names.add(r.name.trim().toLowerCase());
    const minutes =
      r.minutes == null || r.minutes === "" ? null : Number(r.minutes);
    if (
      minutes !== null &&
      (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440)
    )
      throw Error(
        "Limite da pausa: 1 a 1.440 minutos, ou vazio para não alertar.",
      );
    return { id: r.id, name: r.name.trim(), minutes };
  });
}
export function locationOf(raw: any, now = Date.now()) {
  if (
    !raw ||
    typeof raw.latitude !== "number" ||
    !Number.isFinite(raw.latitude) ||
    Math.abs(raw.latitude) > 90 ||
    typeof raw.longitude !== "number" ||
    !Number.isFinite(raw.longitude) ||
    Math.abs(raw.longitude) > 180 ||
    typeof raw.accuracy !== "number" ||
    !Number.isFinite(raw.accuracy) ||
    raw.accuracy < 0 ||
    typeof raw.at !== "string" ||
    !Number.isFinite(Date.parse(raw.at)) ||
    Math.abs(now - Date.parse(raw.at)) > 300000
  )
    throw Error(
      "Permita a localização e obtenha uma posição recente para registrar o apontamento.",
    );
  return {
    latitude: raw.latitude,
    longitude: raw.longitude,
    accuracy: raw.accuracy,
    at: raw.at,
  };
}
export function sessionTotals(s: any, now = Date.now()) {
  const elapsed =
    s.state === "finished"
      ? 0
      : Math.max(0, (now - Date.parse(s.segment_at)) / 1000);
  return {
    active: Number(s.active_seconds) + (s.state === "running" ? elapsed : 0),
    pause: Number(s.pause_seconds) + (s.state === "paused" ? elapsed : 0),
  };
}
export function odometer(value: any) {
  const n = typeof value === "number" ? value : NaN;
  if (!Number.isFinite(n) || n < 0 || n > 10000000)
    throw Error("Informe um odômetro válido.");
  return n;
}
