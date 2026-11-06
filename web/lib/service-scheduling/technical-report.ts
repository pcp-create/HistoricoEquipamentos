import { checklistReport, filterReport, type ReportMode, type ReportField } from "./checklist-report";
import { reportSubmission } from "./checklists";
import { timeLogs, elapsedTime } from "./time-logs";

export function reportEquipment(operation: any, order: any) {
  if(operation.document?.equipmentUnassigned===true)return 'Sem equipamento específico';
  const equipment = operation.document?.equipment;
  return equipment?.label || equipment?.name || (operation.document?.equipmentId ? "Equipamento " + operation.document.equipmentId : order.equipamento) || "Não informado";
}
export function customerPauses(rows: any[], reasons?: any[]) {
  const pauses = new Map<string, number>();
  for (const row of rows) for (const pause of row.pauses) {
    const recorded = pause.startLocation?.document?.reason;
    const configured = recorded?.id ? reasons?.find(r => r.id === recorded.id) : reasons?.find(r => r.name === pause.reason);
    const enabled = reasons !== undefined ? configured?.showInSummary === true : recorded?.showInSummary === true;
    if (enabled && Number.isFinite(pause.seconds) && pause.seconds > 0) {
      const name = configured?.name || pause.reason;
      pauses.set(name, (pauses.get(name) || 0) + pause.seconds);
    }
  }
  return pauses;
}

/** One report structure for the on-screen review and the exported document. */
export function technicalReport(operation: any, order: any, users: any[] = [], sessions: any[] = [], events: any[] = [], operationEvents: any[] = [], mode: ReportMode = "complete",pauseReasons?:any[]) {
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
      ...(mode==="budget"?[["Observação interna da operação",operation.document.internalNote],["Observação interna da OS",order.observacao_interna||order.observacaoInterna]] as [string,any][]:[]),
      ["Profissional responsável", users.find(user => user.email === operation.document.responsible)?.display_name || receipt?.name || operation.document.responsible],
    ]),
    section("asset", "Identificação do ativo", [
      ["Ativo", reportEquipment(operation, order)], ["Número de série", operation.document.equipment?.serial || (operation.document.equipmentId || operation.document.equipmentUnassigned ? null : order.numero_serie || order.serie)], ["Modelo", operation.document.equipmentId || operation.document.equipmentUnassigned ? null : order.modelo_equipamento],
    ]),
    section("location", "Identificação da localidade", [["Local de atendimento", order.endereco_entrega_nome]]),
    section("client", "Identificação do cliente", [
      ["Nome / CNPJ", [order.cliente_nome || order.cliente_razao_social, order.cliente_cpf_cnpj].filter(Boolean).join(" / ")],
      ["Pessoa de contato", order.contato],
    ]),
  ];
  const logs = timeLogs(sessions.filter(s => s.operation_id === operation.id), events.filter(e => e.operation_id === operation.id), operationEvents.filter(e => e.operation_id === operation.id));
  const people = new Map<string, { name: string; work: number; travel: number; pause: number }>();
  for (const row of logs.rows) {
    const name = row.display_name || users.find(u => u.email === row.actor)?.display_name || row.actor;
    const person = people.get(row.actor) || { name, work: 0, travel: 0, pause: 0 };
    person[row.kind === "travel" ? "travel" : "work"] += row.active;
    person.pause += pauseReasons === undefined ? row.pause : [...customerPauses([row],pauseReasons).values()].reduce((a,b)=>a+b,0); people.set(row.actor, person);
  }
  const fieldEvents = section("events", "APONTAMENTOS", []);
  fieldEvents.groups = [];
  for (const person of people.values()) fieldEvents.groups.push({ name: `Totais por profissional · ${person.name}`, fields: [
    field("Tempo de atividade", elapsedTime(person.work), 0), field("Tempo de deslocamento", elapsedTime(person.travel), 1), ...(mode !== "summary" ? [field("Tempo de paradas", elapsedTime(person.pause), 2)] : []), field("Tempo total", elapsedTime(person.work + person.travel + (mode !== "summary" ? person.pause : 0)), 3),
  ] });
  if(mode === "summary"){
    fieldEvents.groups = [{name:"Totais da operação",fields:[
      field("Tempo de atividade",elapsedTime(logs.summary.work),0),
      field("Tempo de deslocamento",elapsedTime(logs.summary.travel),1),
      field("Tempo total",elapsedTime(logs.summary.work + logs.summary.travel),2),
    ]}];
  }
  {
    const pauses = customerPauses(logs.rows, pauseReasons);
    if (pauses.size) fieldEvents.groups.push({name: "Tempo de paradas", fields: [...pauses].map(([name,seconds],index) => field(name,elapsedTime(seconds),index))});
  }
  sections.push(fieldEvents);
  return filterReport([...sections, ...(run?checklistReport(run, mode):[])],mode).map((stage, index) => ({ ...stage, name: stage.name.replace(/^\s*\d+[.\-–]?\s*/, ""), number: String(index + 1).padStart(2, "0") }));
}
