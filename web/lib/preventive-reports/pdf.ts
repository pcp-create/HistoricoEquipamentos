import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb, type PDFPage } from "pdf-lib";
import {
  type Report,
  displayDate,
  displayNumber,
  statusLabel,
  statusColors,
} from "./report";
export async function reportPdf(report: Report) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica),
    bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = await pdf.embedPng(
    await readFile(path.join(process.cwd(), "public/logo-rj.png")),
  );
  const color = (hex: string) =>
    rgb(
      parseInt(hex.slice(1, 3), 16) / 255,
      parseInt(hex.slice(3, 5), 16) / 255,
      parseInt(hex.slice(5, 7), 16) / 255,
    );
  const ink = "#233b53",
    muted = "#64748b",
    border = "#dce5ef";
  const clean = (s: string) =>
    Array.from(s.replace(/[\r\n\t]/g, " "))
      .map((c) => {
        try {
          font.encodeText(c);
          return c;
        } catch {
          return "?";
        }
      })
      .join("");
  const wrap = (s: string, width: number, size: number, strong = false) => {
    const f = strong ? bold : font;
    const lines: string[] = [];
    let line = "";
    for (const word of clean(s).split(/\s+/)) {
      if (line && f.widthOfTextAtSize(line + " " + word, size) > width) {
        lines.push(line);
        line = "";
      }
      for (const c of (line ? " " : "") + word) {
        if (f.widthOfTextAtSize(line + c, size) > width) {
          lines.push(line);
          line = "";
        }
        line += c;
      }
    }
    if (line) lines.push(line);
    return lines;
  };
  let page!: PDFPage,
    y = 0;
  const text = (
    s: string,
    x: number,
    top: number,
    size = 10,
    strong = false,
    fill = ink,
  ) =>
    page.drawText(clean(s), {
      x,
      y: 841.89 - top - size,
      size,
      font: strong ? bold : font,
      color: color(fill),
    });
  const rect = (x: number, top: number, w: number, h: number, fill: string) =>
    page.drawRectangle({
      x,
      y: 841.89 - top - h,
      width: w,
      height: h,
      color: color(fill),
    });
  const newPage = () => {
    page = pdf.addPage([595.28, 841.89]);
    rect(34, 27, 100, 56, "#233b53");
    const size = logo.scaleToFit(88, 44);
    page.drawImage(logo, {
      x: 34 + (100 - size.width) / 2,
      y: 841.89 - 33 - size.height,
      width: size.width,
      height: size.height,
    });
    text("GESTÃO INTEGRADA", 151, 32, 9, true, muted);
    text(
      report.kind === "weekly"
        ? "Preventivas: próximos 30 dias"
        : report.kind === "monthly"
          ? "Relatório mensal de preventivas"
          : "Preventivas vencidas",
      151,
      48,
      16,
      true,
    );
    text(
      `${displayDate(report.date)} · Horário de Brasília · Uso interno`,
      151,
      74,
      9,
      false,
      muted,
    );
    rect(34, 103, 527, 1, border);
    text(`${report.equipmentCount} equipamentos`, 34, 116, 12, true);
    text(`${report.planCount} planos`, 230, 116, 12, true);
    text("Por data de vencimento", 401, 119, 9, false, muted);
    y = 151;
  };
  newPage();
  const field = (
    label: string,
    value: string,
    x: number,
    top: number,
    width: number,
  ) => {
    text(label.toUpperCase(), x, top, 7.5, true, muted);
    wrap(value, width, 10, true).forEach((l, i) =>
      text(l, x, top + 15 + i * 13, 10, true),
    );
  };
  for (const r of report.rows) {
    const client = wrap(r.clients, 491, 9),
      name = wrap(r.name, 491, 12, true),
      identity = wrap(
        `Cód. ${r.equipment} · Série ${r.serial || "não informada"}`,
        491,
        9,
      );
    const plan = wrap(r.plan, 285, 11, true);
    const head =
      18 +
      client.length * 12 +
      8 +
      name.length * 16 +
      6 +
      identity.length * 12 +
      16;
    const height =
      head +
      Math.max(24, plan.length * 14) +
      143 +
      (r.incomplete || r.inconsistent ? 24 : 0);
    if (y + height > 773) newPage();
    rect(34, y, 527, height, "#ffffff");
    page.drawRectangle({
      x: 34,
      y: 841.89 - y - height,
      width: 527,
      height,
      borderColor: color(border),
      borderWidth: 0.8,
    });
    rect(34, y, 3, height, statusColors(r.status).text);
    let top = y + 16;
    client.forEach((l) => {
      text(l, 52, top, 9, false, muted);
      top += 12;
    });
    top += 8;
    name.forEach((l) => {
      text(l, 52, top, 12, true);
      top += 16;
    });
    top += 6;
    identity.forEach((l) => {
      text(l, 52, top, 9, false, muted);
      top += 12;
    });
    top += 16;
    plan.forEach((l, i) => text(l, 52, top + i * 14, 11, true));
    const palette = statusColors(r.status);
    rect(369, top - 3, 174, 24, palette.background);
    text(statusLabel[r.status], 378, top + 3, 9, true, palette.text);
    top += Math.max(24, plan.length * 14) + 8;
    text(
      `${r.hours == null ? "Horas não informadas" : displayNumber(r.hours) + " h"} · ${r.months == null ? "Meses não informados" : r.months + " meses"}`,
      52,
      top,
      9,
      false,
      muted,
    );
    top += 24;
    rect(52, top - 5, 491, 1, border);
    field("Próxima preventiva", displayDate(r.due), 52, top + 8, 150);
    field(
      "Prazo",
      r.days == null
        ? "Conferir leitura"
        : r.days < 0
          ? `${Math.abs(r.days)} dias em atraso`
          : r.days === 0
            ? "Limite atingido"
            : `Em ${r.days} dias`,
      222,
      top + 8,
      150,
    );
    field(
      "Horímetro alvo",
      r.target == null ? "Não informado" : displayNumber(r.target) + " h",
      392,
      top + 8,
      150,
    );
    top += 52;
    field("Última intervenção", displayDate(r.lastDate), 52, top, 150);
    field("Última OS", r.lastOrder || "Não informada", 222, top, 150);
    field(
      "Horímetro na intervenção",
      r.lastMeter == null ? "Não informado" : displayNumber(r.lastMeter) + " h",
      392,
      top,
      150,
    );
    top += 43;
    text(
      `Horímetro atual estimado: ${r.estimatedMeter == null ? "não disponível" : displayNumber(r.estimatedMeter) + " h"} · referência ${displayDate(report.date)}`,
      52,
      top,
      9,
      false,
      muted,
    );
    if (r.incomplete || r.inconsistent)
      text(
        "Previsão parcial ou leitura inconsistente. Conferir cadastro.",
        52,
        top + 18,
        9,
        false,
        "#9a6700",
      );
    y += height + 16;
  }
  if (!report.rows.length) {
    text("Nenhum equipamento nesta situação.", 34, y + 10, 12);
    y += 50;
  }
  if (y + 98 > 773) newPage();
  rect(34, y, 527, 98, "#f2f6fa");
  text("CRITÉRIOS DO RELATÓRIO", 48, y + 12, 9, true);
  const notes = [
    `Base: ${report.coverage.total} equipamentos; ${report.coverage.incomplete} sem previsão completa.`,
    "Previsões por horímetro são estimativas. Vale o limite que vencer primeiro: horas ou meses.",
    "Uma revisão maior pode atender aos planos menores. Confira o escopo antes de programar.",
  ];
  let top = y + 30;
  for (const n of notes)
    for (const l of wrap(n, 495, 9)) {
      text(l, 48, top, 9, false, muted);
      top += 13;
    }
  pdf.getPages().forEach((p, i) => {
    page = p;
    rect(34, 797, 527, 1, border);
    text(
      "RJ Compressores · Planejamento de manutenção",
      34,
      809,
      8,
      false,
      muted,
    );
    text(`${i + 1} / ${pdf.getPageCount()}`, 510, 809, 8, false, muted);
  });
  pdf.setTitle("Gestão Integrada — Preventivas");
  return pdf.save();
}
