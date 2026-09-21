import {
  brazilToday,
  emptyOperating,
  estimateCurrentMeter,
  predict,
  type Plan,
  type Operating,
  type RentalUsage,
} from "../equipment-management/planning";
export type ReportKind = "weekly" | "overdue" | "monthly";
export type Source = {
  id: string;
  name: string;
  serial: string | null;
  clients: string;
  settings: Operating;
  plans: Plan[];
  usage?: RentalUsage;
};
export function buildReport(
  sources: Source[],
  kind: ReportKind,
  today = brazilToday(),
) {
  const equipment = sources.map((e) => {
    const plans = e.plans.map((p) => ({
      ...p,
      forecast: predict(
        p,
        { ...emptyOperating, ...e.settings },
        today,
        e.usage,
      ),
    }));
    const status = plans.some((p) =>
      ["overdue", "due"].includes(p.forecast.status),
    )
      ? "overdue"
      : !plans.length ||
          plans.some((p) => p.forecast.incomplete || p.forecast.inconsistent)
        ? "incomplete"
        : plans.some((p) => p.forecast.status === "soon")
          ? "soon"
          : "ok";
    return {
      id: e.id,
      name: e.name,
      serial: e.serial,
      clients: e.clients,
      status,
      meter: estimateCurrentMeter(
        { ...emptyOperating, ...e.settings },
        today,
        e.usage,
      ),
      plans,
    };
  });
  const selected = equipment.filter((e) =>
    kind === "overdue"
      ? e.status === "overdue"
      : kind === "weekly"
        ? e.status === "soon"
        : ["ok", "soon", "overdue"].includes(e.status),
  );
  const rows = selected.flatMap((e) =>
    e.plans
      .filter(
        (p) =>
          kind === "monthly" ||
          (kind === "weekly"
            ? p.forecast.status === "soon"
            : ["overdue", "due"].includes(p.forecast.status)),
      )
      .map((p) => ({
        equipment: e.id,
        name: e.name,
        serial: e.serial,
        clients: e.clients,
        estimatedMeter: e.meter,
        plan: p.name,
        hours: p.hours,
        months: p.months,
        lastDate: p.lastDate,
        lastOrder: p.lastOrder,
        lastMeter: p.lastMeter,
        due: p.forecast.due,
        days: p.forecast.days,
        target: p.forecast.target,
        status: p.forecast.status,
        incomplete: p.forecast.incomplete,
        inconsistent: p.forecast.inconsistent,
      })),
  );
  rows.sort(
    (a, b) =>
      (a.due || "9999").localeCompare(b.due || "9999") ||
      a.name.localeCompare(b.name),
  );
  return {
    kind,
    date: today,
    timezone: "America/Sao_Paulo",
    equipmentCount: selected.length,
    planCount: rows.length,
    coverage: {
      total: equipment.length,
      overdue: equipment.filter((e) => e.status === "overdue").length,
      soon: equipment.filter((e) => e.status === "soon").length,
      ok: equipment.filter((e) => e.status === "ok").length,
      incomplete: equipment.filter((e) => e.status === "incomplete").length,
    },
    rows,
  };
}
export type Report = ReturnType<typeof buildReport>;
export const statusLabel: Record<string, string> = {
  overdue: "Vencida",
  due: "Limite atingido",
  soon: "Vence em até 30 dias",
  scheduled: "Em dia",
  incomplete: "Dados incompletos",
};
export function statusColors(status: string) {
  if (status === "overdue" || status === "due")
    return { text: "#b42318", background: "#fff0ee" };
  if (status === "soon") return { text: "#946200", background: "#fff6da" };
  if (status === "scheduled") return { text: "#16704a", background: "#eaf7ef" };
  return { text: "#526477", background: "#edf2f7" };
}
export const displayDate = (s: string | null) =>
  s ? s.split("-").reverse().join("/") : "Não informado";
export const displayNumber = (n: number | null) =>
  n == null
    ? "Não informado"
    : n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const escape = (s: unknown) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function reportMessage(report: Report) {
  const title =
    report.kind === "weekly"
      ? "[ALERTA] Preventivas — Próximos 30 dias (semanal)"
      : report.kind === "monthly"
        ? "[ALERTA] Preventivas — Relatório mensal"
        : `[ALERTA] Preventivas vencidas — ${displayDate(report.date)}`;
  const summary = `${report.equipmentCount} equipamentos · ${report.planCount} planos selecionados.`;
  const note =
    "Previsões por horímetro são estimativas. Vale o limite que ocorrer primeiro, por horas ou meses. Revisões maiores podem atender aos planos menores; conferir o escopo antes de programar serviços.";
  const coverage = `Base: ${report.coverage.total} equipamentos; ${report.coverage.incomplete} sem previsão completa. Equipamentos com pendências não são classificados como em dia.`;
  const rows = report.rows
    .slice(0, 30)
    .map(
      (r) =>
        `<tr><td>${escape(r.clients)}<br><strong>${escape(r.name)}</strong><br>Cód. ${escape(r.equipment)} · Série ${escape(r.serial || "não informada")}</td><td>${escape(r.plan)}</td><td style="min-width:150px"><span style="display:inline-block;padding:5px 8px;border-radius:5px;background:${statusColors(r.status).background};color:${statusColors(r.status).text};font-weight:700">${escape(statusLabel[r.status])}</span><br><span style="display:inline-block;margin-top:7px;font-weight:600;color:${statusColors(r.status).text}">${displayDate(r.due)}</span>${r.incomplete ? '<br><small style="color:#64748b">Previsão parcial</small>' : ""}</td><td>${displayDate(r.lastDate)}<br>OS ${escape(r.lastOrder || "não informada")}</td></tr>`,
    )
    .join("");
  const html = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><body style="font-family:Arial,sans-serif;color:#233b53;max-width:980px;margin:auto;padding:24px"><h1 style="font-size:24px">Gestão Integrada</h1><h2>${title}</h2><p>Prezados,</p><p>Segue o acompanhamento das preventivas em ${displayDate(report.date)}, horário de Brasília.</p><p><strong>${summary}</strong></p><table cellpadding="10" cellspacing="0" border="1" style="border-collapse:collapse;border-color:#dbe3ed;font-size:13px;width:100%"><thead><tr><th>Cliente / equipamento</th><th>Plano</th><th>Situação / previsão</th><th>Última intervenção</th></tr></thead><tbody>${rows || '<tr><td colspan="4">Nenhum equipamento nesta situação.</td></tr>'}</tbody></table><p>O PDF anexo contém a relação completa${report.rows.length > 30 ? "; este e-mail exibe os primeiros 30 planos" : ""}.</p><p>${coverage}</p><p style="font-size:12px;color:#66788a">${note}</p><p>Atenciosamente,<br>Gestão Integrada · Planejamento de manutenção</p></body></html>`;
  return {
    subject:
      report.kind === "overdue"
        ? title
        : `${title} — ${displayDate(report.date)}`,
    html,
    text: `${title}\n${displayDate(report.date)} — Brasília\n${summary}\n${coverage}\n${note}\nConsulte a relação completa no PDF anexo.`,
    whatsapp: [
      "*Gestão Integrada | Preventivas*",
      `📅 ${displayDate(report.date)} · Brasília`,
      `\n*${title}*`,
      `📊 ${report.equipmentCount} equipamentos · ${report.planCount} planos`,
      report.rows.length
        ? `\n*${Math.min(10, report.rows.length)} itens · por data de vencimento*`
        : "\nNenhum equipamento nesta situação.",
      ...report.rows.slice(0, 10).map((r, i) => {
        const plain = (value: string) =>
          value
            .replace(/[\r\n]+/g, " ")
            .replace(/[*_~`]/g, "")
            .trim();
        const icon =
          r.status === "overdue" || r.status === "due"
            ? "🔴"
            : r.status === "soon"
              ? "🟡"
              : r.status === "scheduled"
                ? "🟢"
                : "⚪";
        const serial =
          r.serial &&
          !r.name.toLocaleLowerCase().includes(r.serial.toLocaleLowerCase())
            ? ` · Série ${plain(r.serial)}`
            : "";
        const deadline =
          r.days == null
            ? ""
            : r.days < 0
              ? ` · ${Math.abs(r.days)} dias em atraso`
              : r.days === 0
                ? " · Hoje"
                : ` · Faltam ${r.days} dias`;
        return [
          `\n*${i + 1}. ${plain(r.name)}*`,
          `Cliente: ${plain(r.clients)}`,
          `Cód. ${plain(r.equipment)}${serial}`,
          `🔧 ${plain(r.plan)}`,
          `${icon} *${statusLabel[r.status]}*`,
          `Previsão: ${displayDate(r.due)}${deadline}`,
          ...(r.incomplete || r.inconsistent
            ? [
                "⚠️ Conferir cadastro: previsão parcial ou leitura inconsistente.",
              ]
            : []),
        ].join("\n");
      }),
      ...(report.rows.length > 10
        ? [`\nMais ${report.rows.length - 10} planos no relatório completo.`]
        : []),
      "\n📎 Relação completa no PDF enviado por e-mail.",
      "ℹ️ Previsões por horímetro são estimativas. Vale o primeiro limite: horas ou meses.",
    ].join("\n"),
  };
}
