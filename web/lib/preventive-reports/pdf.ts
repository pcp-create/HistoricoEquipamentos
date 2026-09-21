import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { type Report, displayDate, displayNumber, statusLabel } from "./report";
export async function reportPdf(report: Report) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica),
    bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  // Standard PDF font covers Portuguese; replace unsupported glyphs without failing the report.
  const clean = (s: string) =>
    Array.from(s)
      .map((c) => {
        try {
          font.encodeText(c);
          return c;
        } catch {
          return "?";
        }
      })
      .join("")
      .replace(/[\r\n\t]/g, " ");
  let page = pdf.addPage([595.28, 841.89]),
    y = 795;
  const line = (text: string, size = 10, strong = false) => {
    const f = strong ? bold : font;
    const words = clean(text).split(/\s+/);
    let current = "";
    const draw = () => {
      if (y < 55) {
        page = pdf.addPage([595.28, 841.89]);
        y = 795;
      }
      page.drawText(current, {
        x: 36,
        y,
        size,
        font: f,
        color: rgb(0.13, 0.22, 0.32),
      });
      y -= size + 5;
    };
    for (const word of words) {
      if (
        f.widthOfTextAtSize((current ? current + " " : "") + word, size) >
          520 &&
        current
      ) {
        draw();
        current = "";
      }
      for (const char of (current ? " " : "") + word) {
        if (f.widthOfTextAtSize(current + char, size) > 520) {
          draw();
          current = "";
        }
        current += char;
      }
    }
    if (current) draw();
  };
  line("Gestão Integrada | Preventivas", 18, true);
  line(
    `${report.kind === "weekly" ? "Relatório semanal" : "Preventivas vencidas"} — ${displayDate(report.date)} (Brasília)`,
    12,
    true,
  );
  line(`${report.equipmentCount} equipamentos | ${report.planCount} planos`);
  line(
    `Cobertura: ${report.coverage.total} equipamentos; ${report.coverage.incomplete} sem previsão completa.`,
    9,
  );
  line(
    "Previsões por horímetro são estimativas. Vale o limite que vencer primeiro: horas ou meses.",
    9,
  );
  line(
    "Revisões maiores abrangem planos menores. Confira o escopo antes de programar serviços.",
    9,
  );
  y -= 12;
  if (!report.rows.length) line("Nenhum equipamento nesta situação.");
  for (const r of report.rows) {
    if (y < 205) {
      page = pdf.addPage([595.28, 841.89]);
      y = 795;
    }
    line(`${r.clients} | ${r.name}`, 11, true);
    line(
      `Equipamento ${r.equipment} | Série: ${r.serial || "não informada"}`,
      9,
    );
    line(
      `${r.plan} | ${r.hours == null ? "Sem intervalo em horas" : displayNumber(r.hours) + " h"} | ${r.months == null ? "Sem prazo em meses" : r.months + " meses"}`,
      10,
      true,
    );
    line(
      `${statusLabel[r.status]} | Próxima preventiva: ${displayDate(r.due)}${r.days == null ? "" : r.days < 0 ? " | " + Math.abs(r.days) + " dias em atraso" : r.days === 0 ? " | Hoje" : " | Em " + r.days + " dias"}`,
      10,
      true,
    );
    line(
      `Última intervenção: ${displayDate(r.lastDate)} | OS: ${r.lastOrder || "não informada"} | Horímetro: ${displayNumber(r.lastMeter)} h`,
      9,
    );
    line(
      `Horímetro estimado em ${displayDate(report.date)}: ${displayNumber(r.estimatedMeter)} h | Alvo: ${displayNumber(r.target)} h`,
      9,
    );
    if (r.incomplete || r.inconsistent)
      line(
        "Atenção: previsão parcial ou leitura inconsistente; conferir cadastro.",
        9,
      );
    y -= 10;
  }
  const pages = pdf.getPages();
  pages.forEach((p, i) =>
    p.drawText(`Uso interno | ${i + 1} / ${pages.length}`, {
      x: 36,
      y: 25,
      size: 8,
      font,
      color: rgb(0.4, 0.45, 0.5),
    }),
  );
  pdf.setTitle("Gestão Integrada — Preventivas");
  return pdf.save();
}
