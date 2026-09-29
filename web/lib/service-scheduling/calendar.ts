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

/** Splits planned time into the configured work slots, in Brasília time. */
export function operationCalendarAllocation(operation: any, calendar: any): {date:string; minutes:number; start:string; end:string}[] {
  let remaining = Math.round(Number(operation.duration) * 3600000);
  if (!operation.date || !operation.time || !Number.isFinite(remaining) || remaining <= 0 || !calendar?.week?.length)
    return [];
  let cursor = Date.parse(operation.date + "T" + operation.time + ":00-03:00");
  if (!Number.isFinite(cursor)) return [];
  const result: {date:string; minutes:number; start:string; end:string}[] = [];
  for (let days = 0; days < 3660; days++) {
    const date = new Date(cursor - 10800000).toISOString().slice(0, 10);
    for (const slot of workingSlots(calendar, date)) {
      const start = Date.parse(date + "T" + slot.start + ":00-03:00");
      const end = Date.parse(date + "T" + slot.end + ":00-03:00");
      const at = Math.max(cursor, start);
      if (at >= end) continue;
      const used = Math.min(remaining, end - at);
      const finish = new Date(at + used).toISOString();
      const last = result.at(-1);
      if (last?.date === date) {last.minutes += used / 60000; last.end = finish;}
      else result.push({date, minutes: used / 60000, start: new Date(at).toISOString(), end: finish});
      remaining -= used;
      if (remaining <= 0) return result;
      cursor = end;
    }
    cursor = Date.parse(date + "T00:00:00-03:00") + 86400000;
  }
  return [];
}
export function operationCalendarDates(operation: any, calendar: any): string[] {
  const allocation = operationCalendarAllocation(operation, calendar);
  return allocation.length ? allocation.map(day => day.date) : [operation.date || ""];
}
