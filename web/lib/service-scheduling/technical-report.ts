import { checklistReport, filterReport, type ReportMode, type ReportField } from "./checklist-report";
import { reportSubmission } from "./checklists";
import { timeLogs, elapsedTime } from "./time-logs";

/** One report structure for the on-screen review and the exported document. */
export function technicalReport(operation: any, order: any, users: any[] = [], sessions: any[] = [], events: any[] = [], operationEvents: any[] = [], mode: ReportMode = "complete") {
  const run = operation.document.checklistRun;
  const receipt = reportSubmission(run);
  const timestamp = (value: any) => value ? new Date(value).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : "Não informado";
  const field = (label: string, value: any, index: number): ReportField => ({ id: String(index), label, value: value == null || value === "" ? "Não informado" : value, type: "text", photos: [] as string[], comment: "" });
  const section = (id: string, name: string, entries: [string, any][]) => ({ id, name, status: "submitted", groups: [{ name: "", fields: entries.map(([label, value], index) => field(label, value, index)) }] });
  const sections = [
    section("general", "Dados gerais", [
      ["Cód. checklist (serviço)", run?.template.prefix || run?.template.name],
      ["Data de envio no sistema", receipt ? timestamp(receipt.at) : "Não enviado completo"],
      ["Tipo de serviço", operation.document.serviceType || order.tipo_nome],
      ["Descrição da atividade", operation.document.description],
      ["Profissional responsável", users.find(user => user.email === operation.document.responsible)?.display_name || receipt?.name || operation.document.responsible],
    ]),
    section("asset", "Identificação do ativo", [
      ["Ativo", order.equipamento], ["Número de série", order.numero_serie || order.serie], ["Modelo", order.modelo_equipamento],
    ]),
    section("location", "Identificação da localidade", [["Local de atendimento", order.endereco_entrega_nome]]),
    section("client", "Identificação do cliente", [
      ["Nome / CNPJ", [order.cliente_nome || order.cliente_razao_social, order.cliente_cpf_cnpj].filter(Boolean).join(" / ")],
      ["Pessoa de contato", order.contato],
    ]),
  ];
  const logs = timeLogs(sessions.filter(s => s.operation_id === operation.id), events.filter(e => e.operation_id === operation.id), operationEvents.filter(e => e.operation_id === operation.id));
  const timeline: { at: string; label: string; responsible: string }[] = [];
  const people = new Map<string, { name: string; work: number; travel: number; pause: number }>();
  for (const row of logs.rows) {
    const name = row.display_name || users.find(u => u.email === row.actor)?.display_name || row.actor;
    const kind = row.kind === "travel" ? "deslocamento" : "atividade";
    if (row.started_at) timeline.push({ at: row.started_at, label: `Início de ${kind}`, responsible: name });
    if (row.finished_at) timeline.push({ at: row.finished_at, label: `Término de ${kind}`, responsible: name });
    if (!row.started_at && row.recorded_at) timeline.push({ at: row.recorded_at, label: `Registro de ${kind} · ${elapsedTime(row.active)}`, responsible: name });
    for (const pause of mode === 'complete' ? row.pauses : []) {
      if (pause.start) timeline.push({ at: pause.start, label: "Início de pausa", responsible: name });
      if (pause.end) timeline.push({ at: pause.end, label: "Fim de pausa", responsible: name });
    }
    const person = people.get(row.actor) || { name, work: 0, travel: 0, pause: 0 };
    person[row.kind === "travel" ? "travel" : "work"] += row.active;
    person.pause += row.pause; people.set(row.actor, person);
  }
  timeline.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const fieldEvents = section("events", "APONTAMENTOS", []);
  fieldEvents.groups[0].fields = timeline.length
    ? timeline.map((event,index)=>({...field(timestamp(event.at),event.label,index),responsible:event.responsible}))
    : [{...field("—","Nenhum registro nesta operação",0),responsible:"—"}];
  for (const person of people.values()) fieldEvents.groups.push({ name: `Totais por profissional · ${person.name}`, fields: [
    field("Tempo de atividade", elapsedTime(person.work), 0), field("Tempo de deslocamento", elapsedTime(person.travel), 1), ...(mode === "complete" ? [field("Tempo de paradas", elapsedTime(person.pause), 2)] : []), field("Tempo total", elapsedTime(person.work + person.travel + (mode === "complete" ? person.pause : 0)), 3),
  ] });
  sections.push(fieldEvents);
  return filterReport([...sections, ...checklistReport(run, mode)],mode).map((stage, index) => ({ ...stage, name: stage.name.replace(/^\s*\d+[.\-–]?\s*/, ""), number: String(index + 1).padStart(2, "0") }));
}
