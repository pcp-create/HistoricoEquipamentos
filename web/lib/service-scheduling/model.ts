import {validatePauseReasons} from "./field-model";
import {validatePreventiveTypes} from "./preventive-types";
import { validateChecklists } from "./checklists";
import {validateAutomaticRules} from "./automatic-rules";
import { workingSlots, validateCalendarExceptions } from "./calendar";
export const statusNames: Record<string, string> = {
  pending: "Pendente",
  planning: "Em planejamento",
  scheduled: "Programado",
  awaiting_execution: "Aguardando Execução",
  executing: "Em Execução",
  awaiting_review: "Aguardando Revisão",
  reviewed: "Revisado Operação",
  completed: "Concluído Operação",
};
export const blankOperation = () => ({
  serviceType: "",
  jobTitle: "",
  description: "",
  internalNote: "",
  vehicleId: "",
  checklistId: "",
  responsible: "",
  support: [] as string[],
  date: "",
  time: "",
  duration: null as number | null,
  calendarId: "standard",
  checked: [] as string[],
});
export function planningStatus(d: any) {
  return !d.date ? "pending" : !d.time ? "planning" : "scheduled";
}
export function totalHours(d: any) {
  return d.duration == null
    ? null
    : Number(d.duration) *
        new Set([d.responsible, ...d.support].filter(Boolean)).size;
}
export function calendarEnd(d: any, calendar: any): string | null {
  if (!d.date || !d.time || d.duration == null) return null;
  let remaining = Math.round(d.duration * 3600000),
    cursor = Date.parse(d.date + "T" + d.time + ":00-03:00");
  if (!Number.isFinite(cursor)) throw Error("Data e hora inválidas.");
  if (!calendar?.week?.length)
    throw Error("Configure os horários do calendário.");
  for (let days = 0; days < 3660; days++) {
    const local = new Date(cursor - 10800000),
      date = local.toISOString().slice(0, 10),
      day = local.getUTCDay();
    for (const slot of workingSlots(calendar, date)) {
      const start = Date.parse(date + "T" + slot.start + ":00-03:00"),
        end = Date.parse(date + "T" + slot.end + ":00-03:00"),
        at = Math.max(cursor, start);
      if (at >= end) continue;
      if (remaining <= end - at) return new Date(at + remaining).toISOString();
      remaining -= end - at;
      cursor = end;
    }
    cursor = Date.parse(date + "T00:00:00-03:00") + 86400000;
  }
  throw Error("Duração excede o horizonte de cálculo do calendário.");
}
export function validateSettings(d: any) {
  if (
    !d ||
    !Array.isArray(d.serviceTypes) ||
    !d.serviceTypes.length ||
    d.serviceTypes.length > 50 ||
    d.serviceTypes.some(
      (s: any) => typeof s !== "string" || !s.trim() || s.length > 80,
    ) ||
    new Set(d.serviceTypes.map((s: string) => s.trim().toLowerCase())).size !==
      d.serviceTypes.length
  )
    throw Error("Tipos de serviço inválidos ou repetidos.");
  d.checklists = validateChecklists(d.checklists);
  d.preventiveTypes = validatePreventiveTypes(d.preventiveTypes);
  if (
    !Array.isArray(d.calendars) ||
    !d.calendars.length ||
    d.calendars.length > 30 ||
    !d.calendars.some((c: any) => c.id === "standard")
  )
    throw Error("Mantenha o calendário Padrão.");
  for (const c of d.calendars) {
    validateCalendarExceptions(c.exceptions);
    if (
      typeof c.id !== "string" ||
      !c.id ||
      typeof c.name !== "string" ||
      !c.name.trim() ||
      c.name.length > 80 ||
      !Array.isArray(c.week) ||
      !c.week.length ||
      c.week.length > 28
    )
      throw Error("Calendário inválido.");
    const sorted = [...c.week].sort(
      (a, b) => a.day - b.day || String(a.start).localeCompare(b.start),
    );
    for (let i = 0; i < sorted.length; i++) {
      const s = sorted[i],
        p = sorted[i - 1];
      if (
        !Number.isInteger(s.day) ||
        s.day < 0 ||
        s.day > 6 ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(s.start) ||
        (s.end !== "24:00" && !/^([01]\d|2[0-3]):[0-5]\d$/.test(s.end)) ||
        s.start >= s.end ||
        (p && p.day === s.day && p.end > s.start)
      )
        throw Error("Horários inválidos ou sobrepostos no calendário.");
    }
  }
  if (new Set(d.calendars.map((c: any) => c.id)).size !== d.calendars.length)
    throw Error("Calendários repetidos.");
  const vehicles = d.vehicles ?? [];
  if (
    !Array.isArray(vehicles) ||
    vehicles.some(
      (v: any) =>
        !v ||
        typeof v.id !== "string" ||
        !v.id ||
        typeof v.name !== "string" ||
        !v.name.trim() ||
        v.name.length > 160,
    ) ||
    new Set(vehicles.map((v: any) => v.id)).size !== vehicles.length ||
    new Set(vehicles.map((v: any) => v.name.trim().toLowerCase())).size !==
      vehicles.length
  )
    throw Error("Informe veículos válidos, sem duplicidades.");
  return {
    automaticEntry: validateAutomaticRules(d.automaticEntry),
    vehicles: vehicles.map((v: any) => ({ id: v.id, name: v.name.trim() })),
    serviceTypes: d.serviceTypes.map((s: string) => s.trim()),
    checklists: d.checklists,
    preventiveTypes: d.preventiveTypes,
    pauseReasons: validatePauseReasons(d.pauseReasons),
    calendars: d.calendars,
  };
}
export function validateOperation(raw: any, settings: any, users: any[]) {
  const d = { ...blankOperation(), ...raw };
  for (const k of [
    "serviceType",
    "description",
    "internalNote",
    "vehicleId",
    "checklistId",
    "responsible",
    "date",
    "time",
    "calendarId",
  ])
    if (typeof d[k] !== "string") throw Error("Campos da operação inválidos.");
  if (
    d.vehicleId &&
    !(settings.vehicles || []).some((v: any) => v.id === d.vehicleId)
  )
    throw Error("Selecione um veículo cadastrado.");
  if (d.description.length > 40)
    throw Error("Descrição limitada a 40 caracteres.");
  if (d.serviceType && !settings.serviceTypes.includes(d.serviceType))
    throw Error("Tipo de serviço inválido.");
  d.jobTitle = users.find((u) => u.email === d.responsible)?.job_title || "";
  if (
    d.checklistId &&
    !settings.checklists.some((c: any) => c.id === d.checklistId)
  )
    throw Error("Checklist inválido.");
  if (
    !Array.isArray(d.support) ||
    d.support.some((s: any) => typeof s !== "string") ||
    new Set(d.support).size !== d.support.length ||
    d.support.includes(d.responsible)
  )
    throw Error(
      "A equipe de apoio não pode repetir o responsável ou outro colaborador.",
    );
  if (
    [d.responsible, ...d.support]
      .filter(Boolean)
      .some((e) => !users.some((u) => u.email === e && u.enabled))
  )
    throw Error("Escolha funcionários ativos.");
  if (
    d.duration !== null &&
    (typeof d.duration !== "number" ||
      !Number.isFinite(d.duration) ||
      d.duration < 0 ||
      d.duration > 10000 ||
      Math.abs(Math.round(d.duration * 1000) - d.duration * 1000) > 0.000001)
  )
    throw Error("Duração inválida (até três casas decimais).");
  if (
    d.date &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(d.date) ||
      !Number.isFinite(Date.parse(d.date)) ||
      new Date(d.date).toISOString().slice(0, 10) !== d.date)
  )
    throw Error("Data inválida.");
  if (d.time && (!d.date || !/^([01]\d|2[0-3]):[0-5]\d$/.test(d.time)))
    throw Error("Informe uma data e hora de início válidas.");
  const calendar = settings.calendars.find((c: any) => c.id === d.calendarId);
  if (!calendar) throw Error("Calendário inválido.");
  if (
    !Array.isArray(d.checked) ||
    d.checked.some(
      (s: any) =>
        typeof s !== "string" ||
        !settings.checklists
          .find((c: any) => c.id === d.checklistId)
          ?.items.includes(s),
    )
  )
    throw Error("Itens do checklist inválidos.");
  return { document: d, ends_at: calendarEnd(d, calendar) };
}

export const scheduleStatusNames: Record<string, string> = {
  ...statusNames,
  reviewed: "Revisada",
  completed: "Concluída",
};
/** An OS is complete only when all operations are complete; active execution takes precedence. */
export function scheduleStatus(counts: Record<string, number>): string {
  if (Number(counts.executing) > 0) return "executing";
  for (const status of Object.keys(statusNames)) {
    if (status !== "completed" && Number(counts[status]) > 0) return status;
  }
  return Number(counts.completed) > 0 ? "completed" : "pending";
}
