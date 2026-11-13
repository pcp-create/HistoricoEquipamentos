import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFPage } from "pdf-lib";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { addReportFooter } from "../reports/pdf-footer";
import { proposalDraft, CrmError } from "./model";
import { proposalFinancials, itemFinancials, discountedUnitCents } from "./financials";
const companies: Record<string, { name: string; address: string }> = {
  "1": {
    name: "RJ Indústria e Comércio de Máquinas LTDA",
    address:
      "Rua Plasio Bilk Junior, 250 · Tabão · Rio do Sul / SC · (47) 3522-6652 · CNPJ 07.042.325/0001-86",
  },
  "2": {
    name: "Serrana Compressores",
    address:
      "Rod. SC114, 185 · Área Industrial · Otacílio Costa / SC · (49) 3240-0901 · CNPJ 33.394.954/0001-85",
  },
  "27404": {
    name: "Criciúma Compressores",
    address:
      "Rua São Cristóvão, 265 · Demboski · Criciúma / SC · (49) 3240-0901 · CNPJ 55.310.546/0001-30",
  },
};
/** Customer-facing version of the supplied landscape model. Internal costs and notes never enter this document. */
export async function proposalPdf(
  proposal: any,
  customer: any = {},
  equipment: any = {},
) {
  const draft = proposalDraft(proposal.document),
    totals = proposalFinancials(draft.items),
    commercial = draft.commercial || {};
  if (!draft.items.length)
    throw new CrmError("Inclua produtos ou serviços antes de gerar o PDF.");
  const pdf = await PDFDocument.create(),
    font = await pdf.embedFont(StandardFonts.Helvetica),
    bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = await pdf.embedPng(
    await readFile(path.join(process.cwd(), "public/logo-rj.png")),
  );
  const W = 841.89,
    H = 595.28,
    M = 20,
    width = W - 2 * M,
    navy = rgb(0.059, 0.18, 0.314),
    blue = rgb(0.118, 0.333, 0.573),
    gray = rgb(0.5, 0.5, 0.5),
    line = rgb(0.816, 0.875, 0.941),
    white = rgb(1, 1, 1),
    pale = rgb(0.957, 0.965, 0.976);
  const issuer = companies[draft.company] || companies["1"],
    number = "PROP-" + proposal.number;
  const money = (cents: number) =>
    (cents / 100).toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  const clean = (value: any) =>
    Array.from(String(value ?? "").replace(/\t/g, " "))
      .map((c) => {
        if (c === "\n") return c;
        try {
          font.encodeText(c);
          return c;
        } catch {
          return "?";
        }
      })
      .join("");
  function wrap(value: any, w: number, size = 7) {
    const result: string[] = [];
    for (const paragraph of clean(value).split("\n")) {
      let current = "";
      for (const char of paragraph) {
        if (font.widthOfTextAtSize(current + char, size) > w) {
          const at = current.lastIndexOf(" ");
          if (at > 0) {
            result.push(current.slice(0, at));
            current = current.slice(at + 1);
          } else {
            result.push(current);
            current = "";
          }
        }
        current += char;
      }
      result.push(current);
    }
    return result;
  }
  let page!: PDFPage,
    y = 0;
  const text = (
    value: any,
    x: number,
    top: number,
    size = 7,
    strong = false,
    color = navy,
  ) =>
    page.drawText(clean(value), {
      x,
      y: H - top - size,
      size,
      font: strong ? bold : font,
      color,
    });
  const rect = (x: number, top: number, w: number, h: number, color = navy) =>
    page.drawRectangle({ x, y: H - top - h, width: w, height: h, color });
  const rule = (top: number) =>
    page.drawLine({
      start: { x: M, y: H - top },
      end: { x: W - M, y: H - top },
      thickness: 0.5,
      color: line,
    });
  const right = (
    value: string,
    edge: number,
    top: number,
    size = 7,
    strong = false,
    color = navy,
  ) =>
    text(
      value,
      edge - (strong ? bold : font).widthOfTextAtSize(clean(value), size),
      top,
      size,
      strong,
      color,
    );
  function newPage() {
    page = pdf.addPage([W, H]);
    rect(M, 20, width, 52);
    page.drawImage(logo, { x: M + 8, y: H - 65, width: 61, height: 42 });
    text(issuer.name, M + 80, 30, 10, true, white);
    text(issuer.address, M + 80, 48, 5.5, false, rgb(0.68, 0.78, 0.91));
    rect(W - M - 156, 20, 156, 52, blue);
    text("ORÇAMENTO Nº", W - M - 145, 26, 5.5, false, white);
    text(number, W - M - 145, 36, 16, true, white);
    text(
      "Emissão: " +
        new Date(proposal.created_at).toLocaleDateString("pt-BR", {
          timeZone: "America/Sao_Paulo",
        }),
      W - M - 145,
      58,
      6,
      false,
      white,
    );
    y = 82;
  }
  function ensure(height: number) {
    if (y + height > H - 55) newPage();
  }
  function block(
    title: string,
    fields: [string, string][],
    x: number,
    top: number,
    w: number,
  ) {
    text(title, x, top, 6.5, true, blue);
    let cursor = top + 12;
    for (const [label, value] of fields) {
      text(label.toUpperCase(), x, cursor, 5.5, true, gray);
      cursor += 8;
      for (const row of wrap(value || "—", w, 7)) {
        text(row, x, cursor);
        cursor += 9;
      }
      cursor += 2;
    }
    return cursor;
  }
  newPage();
  const payload = customer.payload || {},
    half = (width - 24) / 2;
  function grid(title:string,rows:[string,string][][],x:number,top:number,w:number){
   text(title,x,top,6.5,true,blue);let cursor=top+12;
   for(const fields of rows){const col=(w-12*(fields.length-1))/fields.length;const lines=fields.map((field)=>wrap(field[1]||'—',col,7));
    fields.forEach(([label],i)=>{text(label.toUpperCase(),x+i*(col+12),cursor,5.5,true,gray);lines[i].forEach((line,j)=>text(line,x+i*(col+12),cursor+8+j*9));});cursor+=10+Math.max(...lines.map(a=>a.length))*9;
   }return cursor;
  }
  const left=grid('DADOS DO CLIENTE',[
   [['Razão social / fantasia',proposal.customer_name]],
   [['CPF / CNPJ',customer.document||''],['Cidade / UF',[payload.municipioNome,payload.ufSigla].filter(Boolean).join(' / ')]],
   [['Endereço',[payload.logradouro,payload.numero,payload.bairro].filter(Boolean).join(', ')]],
   [['Contato',commercial.contact||''],['Telefone',commercial.phone||'']],
  ],M+8,y,half-12);
  const rightEnd=grid('VENDEDOR E CONDIÇÕES',[
   [['Vendedor',commercial.sellerName||''],['E-mail',commercial.sellerEmail||'']],
   [['Telefone',commercial.sellerPhone||'']],
   [['Pagamento',commercial.paymentName||'']],
   [['Frete / transportadora',[commercial.freightName,commercial.carrier].filter(Boolean).join(' · ')]],
  ],M+half+24,y,half-12);
  y=Math.max(left,rightEnd)+5;rule(y);y+=12;
  const equipmentEnd=grid('IDENTIFICAÇÃO DO EQUIPAMENTO',[
   [['Equipamento',proposal.names?.equipment||equipment.name||''],['Modelo',equipment.model||'']],
   [['Nº de série',equipment.serial||''],['Validade',commercial.validity??'15 dias úteis']],
  ],M+8,y,half-12);
  const shortScope=wrap(draft.notes,half-12).length<=5;
  const scopeEnd=block('ESCOPO DOS SERVIÇOS',[
   ['Escopo',shortScope?draft.notes:'Consulte o escopo completo abaixo.'],
   ['Entrega prevista',draft.expected||''],
  ],M+half+24,y,half-12);
  y=Math.max(equipmentEnd,scopeEnd)+4;rule(y);y+=12;
  if(draft.notes&&!shortScope){text('ESCOPO / OBSERVAÇÕES',M+8,y,6.5,true,blue);y+=13;for(const row of wrap(draft.notes,width-16)){ensure(12);text(row,M+8,y);y+=10;}y+=8;}
  const xs = [
    M,
    M + 49,
    M + 410,
    M + 459,
    M + 498,
    M + 570,
    M + 625,
    M + 678,
    M + 725,
  ];
  function tableHeader() {
    ensure(40);
    text("ITENS DA PROPOSTA", M + 8, y, 6.5, true, blue);
    y += 13;
    rect(M, y, width, 17);
    [
      "CÓDIGO",
      "DESCRIÇÃO / UN.",
      "NCM",
      "QTD",
      "VL. UNIT. R$",
      "ICMS %",
      "IPI %",
      "VL. IPI R$",
      "TOTAL R$",
    ].forEach((v, i) => text(v, xs[i] + 4, y + 5, 5.8, true, white));
    y += 20;
  }
  tableHeader();
  let index = 0;
  for (const item of draft.items) {
    const lines = wrap(
      item.name + (item.quote?.unit ? " · " + item.quote.unit : "") + (Number(item.discountPercent)>0?` (desconto ${Number(item.discountPercent).toLocaleString('pt-BR')}%)`:''),
      350,
      7,
    );
    for (let start = 0; start < lines.length;) {
      if (y + 14 > H - 55) {
        newPage();
        tableHeader();
      }
      const fits = Math.max(1, Math.floor((H - 58 - y) / 10)),
        part = lines.slice(start, start + fits),
        height = part.length * 10 + 5;
      if (index % 2) rect(M, y, width, height, pale);
      if (start === 0) {
        text(item.code, M + 4, y + 2, 6, false, gray);
        text("—", xs[2] + 4, y + 2);
        text(
          Number(item.quantity).toLocaleString("pt-BR", {
            maximumFractionDigits: 3,
          }),
          xs[3] + 4,
          y + 2,
        );
        right(money(discountedUnitCents(item)), xs[5] - 8, y + 2);
        for (const col of [5, 6, 7])
          text("—", xs[col] + 4, y + 2, 7, false, gray);
        right(money(itemFinancials(item).sale), W - M - 5, y + 2, 7, true);
      }
      part.forEach((row, j) => text(row, xs[1] + 4, y + 2 + j * 10));
      y += height;
      start += part.length;
    }
    rule(y);
    index++;
  }
  y += 10;
  ensure(152);
  const startY = y;
  text("OBSERVAÇÕES E CONDIÇÕES COMERCIAIS", M + 8, y, 6.5, true);
  y += 13;
  const conditions = [
    "Prazo de entrega em dias úteis a contar da aprovação formal.",
    "Qualquer alteração de parâmetro implica revisão de valores e novo aceite.",
    "Impostos de responsabilidade do adquirente não inclusos.",
    "Pagamento exclusivamente via boleto bancário emitido pela RJ Compressores.",
    "Declaro ter conferido todos os dados e estar ciente dos prazos e condições.",
  ];
  for (const value of conditions) {
    for (const row of wrap("• " + value, width * 0.58 - 20, 6)) {
      text(row, M + 8, y, 6, false, gray);
      y += 9;
    }
  }
  const tx = M + width * 0.63,
    tw = width * 0.37;
  let totalY = startY;
  for (const [label, value] of [
    ["Peças — subtotal (s/ IPI)", money(totals.materials)],
    ["Mão de obra — subtotal", money(totals.services)],
    ["IPI total", "Não informado"],
  ]) {
    text(label, tx + 8, totalY, 7, false, gray);
    right(value, W - M - 8, totalY);
    totalY += 17;
  }
  rect(tx, totalY, tw, 26);
  text("VALOR TOTAL", tx + 8, totalY + 8, 7, true, white);
  right(
    "R$ " + money(totals.sale),
    W - M - 8,
    totalY + 7,
    11,
    true,
    rgb(0.91, 0.63, 0),
  );
  y = Math.max(y, totalY + 32) + 8;
  ensure(70);
  rect(M, y, width, 40, pale);
  const confirmation = wrap(
    `Confirmo o pedido referente ao orçamento ${number}, autorizando a emissão das notas fiscais no total de R$ ${money(totals.sale)}.`,
    width - 245,
    6.5,
  );
  confirmation.forEach((row, j) =>
    text(row, M + 8, y + 8 + j * 9, 6.5, false, gray),
  );
  page.drawLine({
    start: { x: W - M - 212, y: H - y - 20 },
    end: { x: W - M - 10, y: H - y - 20 },
    thickness: 0.6,
    color: navy,
  });
  text(
    "Assinatura do responsável           Data: ___/___/______",
    W - M - 212,
    y + 25,
    6,
    false,
    gray,
  );
  y += 46;
  ensure(35);
  rect(M, y, width, 28);
  text("RJ Compressores · Rio do Sul", M + 8, y + 5, 6, true, white);
  text("(47) 3522-6652", M + 8, y + 15, 5.5, false, white);
  text("Serrana Compressores · Otacílio Costa", M + 255, y + 5, 6, true, white);
  text("(49) 3240-0901", M + 255, y + 15, 5.5, false, white);
  text("Criciúma Compressores · Criciúma", M + 520, y + 5, 6, true, white);
  text("rjcompressores.com.br", M + 520, y + 15, 5.5, false, white);
  await addReportFooter(pdf, "Proposta comercial · Gestão Integrada", M);
  return pdf.save();
}
