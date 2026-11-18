export const calendarSources = {
  operations: "Operações de OSs",
  visits: "Visitas",
  tasks: "Tarefas",
} as const;
export type CalendarSource = keyof typeof calendarSources;
export type CalendarEvent = {
  id: string;
  source: CalendarSource;
  sourceId: string;
  day: string;
  time: string;
  title: string;
  customer: string;
  description: string;
  status: string;
  state: "pending" | "completed" | "cancelled";
  href: string;
};
export function calendarDay(value: Date | string = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}
export function shiftDay(day: string, delta: number) {
  const date = new Date(day + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}
export function calendarRange(day: string, view: "month" | "week" | "day") {
  if (view === "day") return { start: day, end: day };
  if (view === "week") {
    const start = shiftDay(day, -new Date(day + "T12:00:00Z").getUTCDay());
    return { start, end: shiftDay(start, 6) };
  }
  const start = day.slice(0, 7) + "-01",
    date = new Date(start + "T12:00:00Z");
  date.setUTCMonth(date.getUTCMonth() + 1);
  date.setUTCDate(0);
  return { start, end: date.toISOString().slice(0, 10) };
}
export function filterCalendarEvents(
  events: CalendarEvent[],
  source: string,
  state: string,
  search: string,
) {
  const fold = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const text = fold(search.trim());
  return events
    .filter(
      (e) =>
        (source === "all" || e.source === source) &&
        (state === "all" || e.state === state) &&
        (!text ||
          fold([e.title, e.customer, e.description].join(" ")).includes(text)),
    )
    .sort(
      (a, b) =>
        a.day.localeCompare(b.day) ||
        a.time.localeCompare(b.time) ||
        a.title.localeCompare(b.title, "pt-BR") ||
        a.id.localeCompare(b.id),
    );
}
