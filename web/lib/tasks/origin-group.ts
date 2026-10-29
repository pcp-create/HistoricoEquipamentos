/** Stable origin categories; titles can change without moving tasks between groups. */
export function taskOriginGroup(task: { origin?: string; source_key?: string }): string {
  const origin = (task.origin || "").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  const key = task.source_key || "";
  if (key.startsWith("preventive") || origin.includes("preventiva")) return "Preventivas";
  if (key.startsWith("report-review:") || key.startsWith("manual:report:") || key.startsWith("manual:order-report-task:") || /revis.*relat|relat.*revis/.test(origin)) return "Revisão de relatórios";
  if (key.startsWith("inspection:") || origin.includes("inspec")) return "Inspeções";
  if (key.startsWith("visit:") || origin.includes("visita")) return "Visitas";
  if (key.startsWith("time-request:") || origin.includes("apontamento")) return "Aprovação de apontamentos";
  if (key.startsWith("rental:") || /locacao|emprestad/.test(origin)) return "Locações e empréstimos";
  if (key.startsWith("manual:workshop:")) return "Oficina";
  return task.origin?.trim() || "Sem origem";
}
