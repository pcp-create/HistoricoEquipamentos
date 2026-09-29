export function validateTimeAdjustment(raw: any, now = Date.now()) {
  const instant = (v: any) => {
    if (
      typeof v !== "string" ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?(?:Z|[+-]\d\d:\d\d)$/.test(
        v,
      ) ||
      !Number.isFinite(Date.parse(v))
    )
      throw Error("Informe data e hora válidas, com fuso horário.");
    if (new Date(v.slice(0, 10)).toISOString().slice(0, 10) !== v.slice(0, 10))
      throw Error("Informe uma data válida.");
    return Date.parse(v);
  };
  const start = instant(raw?.started_at),
    end = instant(raw?.finished_at);
  if (end <= start || end > now + 60000)
    throw Error(
      "O término deve ser posterior ao início e não pode estar no futuro.",
    );
  if (end - start > 7 * 86400000)
    throw Error("O apontamento não pode ultrapassar sete dias.");
  if (!Array.isArray(raw.pauses) || raw.pauses.length > 100)
    throw Error("Pausas inválidas.");
  let last = start,
    pause = 0;
  const pauses = raw.pauses.map((p: any) => {
    const a = instant(p.start),
      b = instant(p.end);
    if (a < last || a < start || b > end || b <= a)
      throw Error(
        "As pausas devem estar em ordem, sem sobreposição e dentro do apontamento.",
      );
    if (
      typeof p.reason !== "string" ||
      !p.reason.trim() ||
      p.reason.length > 500
    )
      throw Error("Informe o motivo da pausa.");
    last = b;
    pause += (b - a) / 1000;
    return {
      start: new Date(a).toISOString(),
      end: new Date(b).toISOString(),
      reason: p.reason.trim(),
      seconds: (b - a) / 1000,
    };
  });
  return {
    started_at: new Date(start).toISOString(),
    finished_at: new Date(end).toISOString(),
    active_seconds: (end - start) / 1000 - pause,
    pause_seconds: pause,
    pauses,
  };
}
