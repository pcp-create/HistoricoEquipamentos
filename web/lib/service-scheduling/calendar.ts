export function workingSlots(calendar: any, date: string) {
  const exception = (calendar.exceptions || []).find(
    (e: any) => e.startDate <= date && e.endDate >= date,
  );
  const day = new Date(date + "T12:00:00Z").getUTCDay();
  return [
    ...(exception
      ? exception.hours
      : calendar.week.filter((s: any) => s.day === day)),
  ].sort((a: any, b: any) => a.start.localeCompare(b.start));
}
export function validateCalendarExceptions(exceptions: any) {
  if (exceptions === undefined) return;
  if (!Array.isArray(exceptions) || exceptions.length > 1000)
    throw Error("Exceções do calendário inválidas.");
  const validDate = (d: any) =>
    typeof d === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(d) &&
    Number.isFinite(Date.parse(d)) &&
    new Date(d).toISOString().slice(0, 10) === d;
  const sorted = [...exceptions].sort((a, b) =>
    String(a?.startDate).localeCompare(String(b?.startDate)),
  );
  for (let i = 0; i < sorted.length; i++) {
    const e = sorted[i];
    if (
      !e ||
      typeof e.name !== "string" ||
      !e.name.trim() ||
      e.name.length > 120 ||
      !validDate(e.startDate) ||
      !validDate(e.endDate) ||
      e.startDate > e.endDate ||
      !Array.isArray(e.hours) ||
      e.hours.length > 8
    )
      throw Error("Informe nome, período e horários válidos para a exceção.");
    if (i && sorted[i - 1].endDate >= e.startDate)
      throw Error("Os períodos das exceções não podem se sobrepor.");
    const hours = [...e.hours].sort((a, b) =>
      String(a?.start).localeCompare(String(b?.start)),
    );
    hours.forEach((h, j) => {
      if (
        !h ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(h.start) ||
        (h.end !== "24:00" && !/^([01]\d|2[0-3]):[0-5]\d$/.test(h.end)) ||
        h.start >= h.end ||
        (j && hours[j - 1].end > h.start)
      )
        throw Error("Horários da exceção inválidos ou sobrepostos.");
    });
  }
}
