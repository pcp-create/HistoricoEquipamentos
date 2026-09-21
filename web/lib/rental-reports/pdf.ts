import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { type RentalReport, contractPresentation, rentalTitle } from "./report";
import { displayDate } from "../preventive-reports/report";
export async function rentalPdf(report: RentalReport) {
  const pdf = await PDFDocument.create(),
    font = await pdf.embedFont(StandardFonts.Helvetica),
    bold = await pdf.embedFont(StandardFonts.HelveticaBold),
    logo = await pdf.embedPng(
      await readFile(path.join(process.cwd(), "public/logo-rj.png")),
    );
  const ink = rgb(0.14, 0.23, 0.33),
    muted = rgb(0.4, 0.46, 0.54);
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
  const wrap = (s: string, width: number, size = 10) => {
    const lines: string[] = [];
    let line = "";
    for (const word of clean(s).split(/\s+/)) {
      if (line && font.widthOfTextAtSize(line + " " + word, size) > width) {
        lines.push(line);
        line = "";
      }
      for (const c of (line ? " " : "") + word) {
        if (font.widthOfTextAtSize(line + c, size) > width) {
          lines.push(line);
          line = "";
        }
        line += c;
      }
    }
    if (line) lines.push(line);
    return lines;
  };
  let page = pdf.addPage([595.28, 841.89]),
    y = 0;
  const text = (s: string, x: number, top: number, size = 10, strong = false) =>
    page.drawText(clean(s), {
      x,
      y: 841.89 - top - size,
      size,
      font: strong ? bold : font,
      color: ink,
    });
  const header = () => {
    page.drawRectangle({ x: 34, y: 758, width: 100, height: 56, color: ink });
    const d = logo.scaleToFit(88, 44);
    page.drawImage(logo, {
      x: 34 + (100 - d.width) / 2,
      y: 764,
      width: d.width,
      height: d.height,
    });
    text("GESTÃO INTEGRADA", 151, 32, 9, true);
    text("Locações e empréstimos", 151, 48, 18, true);
    text(`${displayDate(report.date)} · Brasília · Uso interno`, 151, 75, 9);
    wrap(rentalTitle(report.kind), 520, 12).forEach((l, i) =>
      text(l, 34, 109 + i * 16, 12, true),
    );
    text(`${report.equipmentCount} equipamentos selecionados`, 34, 137, 10);
    y = 167;
  };
  header();
  for (const r of report.rows) {
    const lines = [
      ...wrap(r.status.customer || "Cliente não informado", 490),
      ...wrap(r.name, 485, 11),
    ];
    const h = 170 + lines.length * 15;
    if (y + h > 765) {
      page = pdf.addPage([595.28, 841.89]);
      header();
    }
    page.drawRectangle({
      x: 34,
      y: 841.89 - y - h,
      width: 527,
      height: h,
      borderColor: rgb(0.85, 0.89, 0.94),
      borderWidth: 1,
    });
    let top = y + 15;
    lines.forEach((l, i) => {
      text(l, 50, top, i === 0 ? 10 : 11, i > 0);
      top += 15;
    });
    for (const l of wrap(
      `Cód. ${r.id} · ID interno ${r.internal_code || "—"} · Série ${r.serial || "—"}`,
      490,
      9,
    )) {
      text(l, 50, top + 5, 9);
      top += 13;
    }
    top += 18;
    text(
      `${r.status.label} · OS ${r.status.order || "—"} · Empresa ${r.status.company || "—"}`,
      50,
      top,
      10,
      true,
    );
    top += 28;
    text("INÍCIO DO CONTRATO", 50, top, 8);
    text("FIM DO CONTRATO", 225, top, 8);
    text("VIGÊNCIA TOTAL", 400, top, 8);
    top += 15;
    text(displayDate(r.contract.start), 50, top, 11, true);
    text(displayDate(r.contract.end), 225, top, 11, true);
    text(
      r.contract.duration == null
        ? "Não informada"
        : r.contract.duration + " dias",
      400,
      top,
      11,
      true,
    );
    top += 30;
    const p = contractPresentation(r.contract.remaining),
      hex = p.color;
    page.drawText(clean(p.label), {
      x: 50,
      y: 841.89 - top - 12,
      size: 12,
      font: bold,
      color: rgb(
        parseInt(hex.slice(1, 3), 16) / 255,
        parseInt(hex.slice(3, 5), 16) / 255,
        parseInt(hex.slice(5, 7), 16) / 255,
      ),
    });
    y += h + 14;
  }
  if (y + 65 > 765) {
    page = pdf.addPage([595.28, 841.89]);
    header();
  }
  for (const l of wrap(
    `Base: ${report.coverage.active} contratos ativos; ${report.coverage.incomplete} com datas incompletas. Início: abertura da OS. Fim: Data de Entrega da OS. Contratos sem datas válidas não recebem classificação de prazo.`,
    520,
    9,
  )) {
    text(l, 34, y, 9);
    y += 13;
  }
  pdf
    .getPages()
    .forEach((p, i) =>
      p.drawText(
        `RJ Compressores | Uso interno | ${i + 1} / ${pdf.getPageCount()}`,
        { x: 34, y: 25, size: 8, font, color: muted },
      ),
    );
  return pdf.save();
}
