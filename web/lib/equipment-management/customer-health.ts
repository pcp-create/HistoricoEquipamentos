export type FleetSignal =
  "ok" | "attention" | "critical" | "workshop" | "unknown";
export function customerHealth(e: {
  plans: number;
  forecast?: {
    status?: string;
    incomplete?: boolean;
    inconsistent?: boolean;
  } | null;
  workshop?: unknown;
  openOrders?: unknown[];
}): { key: FleetSignal; label: string; reason: string } {
  if (e.workshop)
    return {
      key: "workshop",
      label: "Em oficina",
      reason: "Equipamento em manutenção na oficina.",
    };
  if (["due", "overdue"].includes(e.forecast?.status || ""))
    return {
      key: "critical",
      label: "Manutenção vencida",
      reason: "Preventiva vencida ou limite de utilização atingido.",
    };
  if (e.forecast?.status === "soon")
    return {
      key: "attention",
      label: "Atenção",
      reason: "Preventiva prevista para os próximos 30 dias.",
    };
  if (e.openOrders?.length)
    return {
      key: "attention",
      label: "Atendimento em aberto",
      reason: "Existe uma ordem de serviço pendente para esta máquina.",
    };
  if (
    !e.plans ||
    !e.forecast ||
    e.forecast.incomplete ||
    e.forecast.inconsistent ||
    e.forecast.status !== "scheduled"
  )
    return {
      key: "unknown",
      label: "Dados a completar",
      reason: "Não há dados suficientes para confirmar a situação preventiva.",
    };
  return {
    key: "ok",
    label: "Em dia",
    reason: "Sem pendências identificadas nos registros de manutenção.",
  };
}
