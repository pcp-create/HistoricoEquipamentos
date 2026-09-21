import { rentalContract } from "../equipment-management/contract";
import { brazilToday } from "../equipment-management/planning";
import { displayDate } from "../preventive-reports/report";
export type Kind = "weekly" | "monthly" | "overdue";
export type RentalSource = {
  id: string;
  name: string;
  serial: string | null;
  internal_code: string | null;
  rentalStatus: {
    key: string;
    label: string;
    customer: string | null;
    company: number | null;
    order: string | null;
    contract?: { start: string | null; end: string | null };
  } | null;
};
export function buildRentalReport(
  sources: RentalSource[],
  kind: Kind,
  today = brazilToday(),
) {
  const active = sources
    .filter((e) => ["rented", "loaned"].includes(e.rentalStatus?.key || ""))
    .map((e) => ({
      ...e,
      status: e.rentalStatus!,
      contract: rentalContract(
        e.rentalStatus?.contract?.start ?? null,
        e.rentalStatus?.contract?.end ?? null,
        today,
      ),
    }));
  const rows = active
    .filter(
      (e) =>
        kind === "monthly" ||
        (e.contract.remaining != null &&
          (kind === "overdue"
            ? e.contract.remaining < 5
            : e.contract.remaining >= 0 && e.contract.remaining < 30)),
    )
    .sort(
      (a, b) =>
        (a.contract.remaining ?? Infinity) -
          (b.contract.remaining ?? Infinity) || a.name.localeCompare(b.name),
    );
  return {
    kind,
    date: today,
    equipmentCount: rows.length,
    coverage: {
      active: active.length,
      rented: active.filter((e) => e.status.key === "rented").length,
      loaned: active.filter((e) => e.status.key === "loaned").length,
      incomplete: active.filter((e) => e.contract.remaining == null).length,
    },
    rows,
  };
}
export type RentalReport = ReturnType<typeof buildRentalReport>;
export const rentalTitle = (kind: Kind) =>
  kind === "overdue"
    ? "[ALERTA] Locações/Emprestimos vencidos ou com menos de 5 dias"
    : kind === "weekly"
      ? "Contratos próximos do vencimento"
      : "Relatório mensal de locações e empréstimos";
export function contractPresentation(remaining: number | null) {
  return remaining == null
    ? {
        label: "Conferir datas",
        color: "#526477",
        background: "#edf2f7",
        icon: "⚪",
      }
    : remaining < 0
      ? {
          label: `Vencido há ${Math.abs(remaining)} dias`,
          color: "#b42318",
          background: "#fff0ee",
          icon: "🔴",
        }
      : remaining === 0
        ? {
            label: "Vence hoje",
            color: "#b42318",
            background: "#fff0ee",
            icon: "🔴",
          }
        : remaining < 5
          ? {
              label: `Faltam ${remaining} dias`,
              color: "#b42318",
              background: "#fff0ee",
              icon: "🔴",
            }
          : remaining < 30
            ? {
                label: `Faltam ${remaining} dias`,
                color: "#946200",
                background: "#fff6da",
                icon: "🟡",
              }
            : {
                label: `Faltam ${remaining} dias`,
                color: "#16704a",
                background: "#eaf7ef",
                icon: "🟢",
              };
}
const esc = (s: unknown) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const plain = (s: string) => s.replace(/[\r\n*_~`]/g, " ").trim();
export function rentalMessage(report: RentalReport) {
  const title =
      report.kind === "overdue"
        ? `${rentalTitle(report.kind)} — ${displayDate(report.date)}`
        : rentalTitle(report.kind),
    summary = `${report.equipmentCount} máquinas locadas ou emprestadas neste relatório.`;
  const coverage = `Base: ${report.coverage.active} contratos ativos; ${report.coverage.incomplete} com datas incompletas. Datas incompletas aparecem no mensal, sem classificação de prazo.`;
  const html = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><body style="font-family:Arial,sans-serif;color:#233b53;max-width:1000px;margin:auto;padding:24px"><h1>Gestão Integrada</h1><h2>${title}</h2><p>Prezados,</p><p>Segue o acompanhamento dos contratos em ${displayDate(report.date)}, horário de Brasília.</p><p><strong>${summary}</strong></p><table cellpadding="10" border="1" cellspacing="0" style="border-collapse:collapse;border-color:#dbe3ed;font-size:13px;width:100%"><tr><th>Cliente / equipamento</th><th>Vínculo / OS</th><th>Período</th><th>Situação</th></tr>${
    report.rows
      .slice(0, 30)
      .map((r) => {
        const p = contractPresentation(r.contract.remaining);
        return `<tr><td>${esc(r.status.customer || "Cliente não informado")}<br><strong>${esc(r.name)}</strong><br>Cód. ${esc(r.id)} · ID interno ${esc(r.internal_code || "—")}<br>Série ${esc(r.serial || "—")}</td><td>${esc(r.status.label)}<br>OS ${esc(r.status.order || "—")} · Empresa ${esc(r.status.company || "—")}</td><td>Início: ${displayDate(r.contract.start)}<br>Fim: ${displayDate(r.contract.end)}<br>Vigência: ${r.contract.duration == null ? "não informada" : r.contract.duration + " dias"}</td><td><span style="display:inline-block;padding:6px;background:${p.background};color:${p.color};font-weight:bold;border-radius:5px">${p.label}</span></td></tr>`;
      })
      .join("") ||
    '<tr><td colspan="4">Nenhum contrato nesta situação.</td></tr>'
  }</table><p>Relação completa no PDF anexo. Este e-mail exibe até 30 itens.</p><p>${coverage}</p><p style="font-size:12px;color:#64748b">Início: abertura da OS. Fim: Data de Entrega da OS. Classificação conforme vínculo atual da máquina.</p><p>Atenciosamente,<br>Gestão Integrada · Gestão de equipamentos</p></body></html>`;
  return {
    subject:
      report.kind === "overdue"
        ? title
        : `${title} — ${displayDate(report.date)}`,
    html,
    text: `${title}\n${summary}\n${coverage}\nRelação completa no PDF anexo.`,
    whatsapp: [
      `*Gestão Integrada | Locações e empréstimos*`,
      `📅 ${displayDate(report.date)} · Brasília`,
      `\n*${title}*`,
      `📊 ${summary}`,
      ...report.rows.slice(0, 10).map((r, i) => {
        const p = contractPresentation(r.contract.remaining);
        return `\n*${i + 1}. ${plain(r.name)}*\nCliente: ${plain(r.status.customer || "Não informado")}\nCód. ${r.id} · ID interno ${plain(r.internal_code || "não informado")}\n${r.status.label} · OS ${r.status.order || "não informada"}\nInício: ${displayDate(r.contract.start)} · Fim: ${displayDate(r.contract.end)}\n${p.icon} *${p.label}*`;
      }),
      ...(!report.rows.length ? ["\nNenhum contrato nesta situação."] : []),
      ...(report.rows.length > 10
        ? [`\nMais ${report.rows.length - 10} itens no relatório completo.`]
        : []),
      "\n📎 Relação completa no PDF enviado por e-mail.",
    ].join("\n"),
  };
}
