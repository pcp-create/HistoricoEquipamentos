import { currentTaxes, deliveryTerm } from "./product-terms";
import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFPage } from "pdf-lib";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { addProposalFooter } from "../reports/pdf-footer";
import { proposalDraft, CrmError } from "./model";
import { proposalFinancials, itemFinancials } from "./financials";
import { formatContactPhone } from "../contact-phone";
import { DEFAULT_BACKUP_TERMS } from "./backup";
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
  productNcms: Record<string, string | null> = {},
  {includeTaxes = true}: {includeTaxes?: boolean} = {},
) {
  const draft = proposalDraft(proposal.document),
    totals = proposalFinancials(draft.items),
    commercial = draft.commercial || {};
  // The route supplies trusted server-side tax and inventory enrichment; the parser strips client snapshots.
  draft.items = draft.items.map((item,index)=>({...item, taxes:proposal.document.items[index]?.taxes, availableStock:proposal.document.items[index]?.availableStock}));
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
    rect(M, 20, width, 64);
    page.drawImage(logo, { x: M + 8, y: H - 73, width: 61, height: 42 });
    text(issuer.name, M + 80, 34, 10, true, white);
    text(issuer.address, M + 80, 52, 5.5, false, rgb(0.68, 0.78, 0.91));
    rect(W - M - 156, 20, 156, 64, blue);
    text("ORÇAMENTO Nº", W - M - 145, 25, 5.5, false, white);
    text(number, W - M - 145, 34, 15, true, white);
    const issueDate = "Emissão: " + new Date(proposal.created_at).toLocaleDateString("pt-BR", {timeZone:"America/Sao_Paulo"});
    const issueX = W - M - 145;
    text(issueDate, issueX, 55, 6, false, white);
    const validity = `Validade: ${commercial.validity ?? "15 dias úteis"}`;
    const validitySize = Math.min(6, 137 / Math.max(1, font.widthOfTextAtSize(clean(validity), 1)));
    text(validity, issueX, 67, validitySize, false, white);
    y = 94;
  }
  function ensure(height: number) {
    if (y + height > H - 55) newPage();
  }
  // Compact columns omit empty fields instead of reserving rows for dashes.
  function details(title: string, fields: [string, string][], x: number, top: number, w: number) {
    text(title, x, top, 6.5, true, blue);
    let cursor = top + 12;
    for (const [label, value] of fields) {
      if (!String(value || "").trim()) continue;
      const prefix = `${label}: `;
      const prefixWidth = bold.widthOfTextAtSize(clean(prefix), 7);
      const rows = wrap(value, Math.max(1, w - prefixWidth), 7);
      text(prefix, x, cursor, 7, true);
      for (const [index, row] of rows.entries()) {
        text(row, x + (index === 0 ? prefixWidth : 0), cursor);
        cursor += 9;
      }
      cursor += 3;
    }
    return cursor;
  }
  newPage();
  const payload = customer.payload || {}, col = (width - 40) / 3;
  const ends = [
    details("DADOS DO CLIENTE", [
      ["Razão social", payload.razaoSocial?.trim() || customer.name || proposal.customer_name],
      ["Nome fantasia", [payload.nomeFantasia, payload.fantasia, payload.apelido].find(value => typeof value === "string" && value.trim())?.trim() || ""],
      ["CPF / CNPJ", customer.document || ""],
      ["Cidade / UF", [payload.municipioNome, payload.ufSigla].filter(Boolean).join(" / ")],
      ["Endereço", [payload.logradouro, payload.numero, payload.bairro].filter(Boolean).join(", ")],
      ["Contato", commercial.contact || ""],
      ["Telefone", commercial.phone || ""],
    ], M + 8, y, col),
    details("EQUIPAMENTO", [
      ["Equipamento", equipment.name || proposal.names?.equipment || ""],
      ["Modelo", equipment.model || ""],
      ["Nº de série", equipment.serial || ""],
    ], M + 20 + col, y, col),
    details("VENDEDOR E CONDIÇÕES", [
      ["Vendedor", commercial.sellerName || ""],
      ["E-mail", commercial.sellerEmail || ""],
      ["Telefone", (() => { const phone=commercial.sellerPhone || "", digits=phone.replace(/\D/g, ""); return (/^\d{10,11}$/.test(digits) || /^55\d{10,11}$/.test(digits)) ? formatContactPhone(phone) : phone; })()],
      ["Pagamento", commercial.paymentName || ""],
      ["Frete", (commercial.freightName || "").replace(/^\s*\d+\s*[-–—]\s*/, "")],
      ["Entrega prevista", draft.expected || ""],
    ], M + 32 + 2 * col, y, col),
  ];
  y = Math.max(...ends) + 3;
  rule(y); y += 8;
  const hasBackup = commercial.backupEnabled === 'yes';
  if (draft.notes?.trim()) {
    ensure(30);
    text('ESCOPO / OBSERVAÇÕES', M + 8, y, 6.5, true, blue); y += 12;
    for (const row of wrap(draft.notes, width - 16)) {
      ensure(12); text(row, M + 8, y); y += 9;
    }
    y += 6;
  }
  const columns = [
    {key:"code",label:"CÓDIGO",w:38},{key:"name",label:"DESCRIÇÃO",w:includeTaxes?225:320},
    {key:"delivery",label:"PRAZO ENTREGA",w:58},{key:"ncm",label:"NCM",w:43},{key:"quantity",label:"QTD",w:25},{key:"unit",label:"UN.",w:28},{key:"price",label:"VL. UNIT. R$",w:53},
    ...(includeTaxes?[{key:"icms",label:"ICMS",w:46},{key:"pis",label:"PIS",w:44},{key:"cofins",label:"COFINS",w:44},{key:"ipi",label:"IPI",w:42},{key:"icmsSt",label:"ST",w:42}]:[]),
    {key:"discount",label:"DESCONTO",w:58},{key:"total",label:"TOTAL R$",w:56},
  ];
  const scale=width/columns.reduce((sum,c)=>sum+c.w,0);
  let cursor=M;
  const layout=columns.map(c=>{const v={...c,x:cursor,w:c.w*scale};cursor+=v.w;return v});
  const column=(key:string)=>layout.find(c=>c.key===key)!;
  const discountColumn=column("discount"), discountAmountEdge=discountColumn.x+discountColumn.w-1-font.widthOfTextAtSize("- 100,00%",5.58)-2;
  function discountAmount(value:string,top:number,strong=false) {
    const size=Math.min(6.2,(discountAmountEdge-discountColumn.x-2)/Math.max(1,(strong?bold:font).widthOfTextAtSize(clean(value),1)));
    right(value,discountAmountEdge,top,size,strong);
  }
  function cell(key:string,value:string,top:number,strong=false,color=navy) {
    const c=column(key), size=Math.min(6.2,(c.w-5)/Math.max(1,(strong?bold:font).widthOfTextAtSize(clean(value),1)));
    right(value,c.x+c.w-3,top,size,strong,color);
  }
  const gross=(item:typeof draft.items[number])=>Math.round(Number(item.quantity)*Math.round(Number(item.price)*100));
  const discount=(item:typeof draft.items[number])=>gross(item)-itemFinancials(item).sale;
  const unit=(value:string)=>({UNIDADE:'UN',UNIDADES:'UN',HORA:'H',HORAS:'H',PACOTE:'PCT',SERVIÇO:'SV',SERVICO:'SV'} as Record<string,string>)[value.trim().toUpperCase()]||value.trim().toUpperCase()||'—';
  function tableHeader(label:string) {
    ensure(40);
    if(label){text(label,M+8,y,6.5,true,blue);y+=11;}
    rect(M,y,width,17);
    for(const c of layout){
      const size=Math.min(5.2,(c.w-4)/Math.max(1,bold.widthOfTextAtSize(clean(c.label),1)));
      if (c.key === "discount") text(c.label,c.x+(c.w-bold.widthOfTextAtSize(clean(c.label),size))/2,y+5,size,true,white);
      else if (["quantity","price","icms","pis","cofins","ipi","icmsSt","total"].includes(c.key))
        right(c.label,c.x+c.w-3,y+5,size,true,white);
      else text(c.label,c.x+2,y+5,size,true,white);
    }
    y+=18;
  }
  tableHeader("");
  for(const kind of ["material","service"] as const) {
    const items=draft.items.filter(item=>item.kind===kind);
    if(!items.length) continue;
    const title=kind==="material"?"Produtos":"Serviços";
    if(y+30>H-55){newPage();tableHeader("ITENS DA PROPOSTA (CONTINUAÇÃO)");}
    rect(M,y,width,16,rgb(0.91,0.95,0.98));
    text(`${title} (${items.length})`,M+8,y+4,6.5,true,blue);y+=16;
    let index=0;
    for(const item of items){
      const taxes=includeTaxes?currentTaxes(draft,item):null;
      const lines=wrap(item.name,column("name").w-6,6.2);
      if(item.notes?.trim())lines.push(...wrap(item.notes.trim(),column("name").w-6,6.2));
      const deliveryLines=item.kind==="material"?wrap(deliveryTerm(draft,item),column("delivery").w-6,6):[];
      while(lines.length<deliveryLines.length)lines.push("");
      for(let start=0;start<lines.length;){
        if(y+14>H-55){newPage();tableHeader(`${title} (CONTINUAÇÃO)`);}
        const fits=Math.max(1,Math.floor((H-58-y)/10)),part=lines.slice(start,start+fits),height=part.length*10+5;
        if(index%2)rect(M,y,width,height,pale);
        if(start===0){
          text(item.code,column("code").x+2,y+2,5.8,false,gray);
          text(item.kind==="material"?productNcms[item.code]||"—":"—",column("ncm").x+2,y+2,5.8);
          cell("quantity",Number(item.quantity).toLocaleString("pt-BR",{maximumFractionDigits:3}),y+2);
          text(unit(item.quote?.unit||""),column("unit").x+2,y+2,5.8);
          cell("price",money(Math.round(Number(item.price)*100)),y+2);
          if(includeTaxes)for(const key of ["icms","pis","cofins","ipi","icmsSt"] as const)cell(key,taxes?.[key]!=null?money(taxes[key]!):"—",y+2,false,gray);
          const discountPercent=Math.min(100,Math.max(0,Number(item.discountPercent)||0)).toLocaleString("pt-BR",{maximumFractionDigits:2});
          discountAmount(money(discount(item)),y+2);
          text(`- ${discountPercent}%`,discountAmountEdge+2,y+2.62,5.58,false,gray);
          cell("total",money(gross(item)),y+2,true);
        }
        part.forEach((row,j)=>{text(row,column("name").x+2,y+2+j*10,6.2);if(deliveryLines[start+j])text(deliveryLines[start+j],column("delivery").x+2,y+2+j*10,6);});
        y+=height;start+=part.length;
      }
      rule(y);index++;
    }
    y+=4;
  }
  ensure(27);
  const materialItems=draft.items.filter(i=>i.kind==="material");
  rect(M,y,width,19,rgb(0.86,0.91,0.97));
  right("SUBTOTAL",column("price").x+column("price").w-3,y+6,6,true,blue);
  if(includeTaxes)for(const key of ["icms","pis","cofins","ipi","icmsSt"] as const){const applicable=key==='pis'||key==='cofins'?draft.items:materialItems;const amounts=applicable.map(item=>currentTaxes(draft,item)?.[key]);cell(key,amounts.length&&amounts.every(value=>value!=null)?money(amounts.reduce<number>((sum,value)=>sum+value!,0)):"—",y+6,true);}
  const discountSubtotal=money(draft.items.reduce((sum,item)=>sum+discount(item),0));
  const discountSubtotalSize=Math.min(6.2,(discountColumn.w-6)/Math.max(1,bold.widthOfTextAtSize(clean(discountSubtotal),1)));
  text(discountSubtotal,discountColumn.x+(discountColumn.w-bold.widthOfTextAtSize(clean(discountSubtotal),discountSubtotalSize))/2,y+6,discountSubtotalSize,true);
  cell("total",money(draft.items.reduce((sum,item)=>sum+gross(item),0)),y+6,true);y+=25;
  const conditions = [
    "Prazo de entrega por produto; dias úteis a contar da aprovação formal.",
    ...(includeTaxes ? ["Tributos estimados sujeitos à confirmação no faturamento."] : []),
    "Qualquer alteração de parâmetro implica revisão de valores e novo aceite.",
    "Pagamento exclusivamente via boleto bancário emitido pela RJ Compressores.",
    "Declaro ter conferido todos os dados e estar ciente dos prazos e condições.",
  ];
  const conditionRows = conditions.flatMap(value => wrap("• " + value, width * (hasBackup ? 0.28 : 0.58) - 20, 6));
  ensure(Math.max(includeTaxes ? 100 : 80, 13 + conditionRows.length * 9));
  const startY = y;
  text("OBSERVAÇÕES E CONDIÇÕES COMERCIAIS", M + 8, y, 6.5, true);
  y += 13;
  for (const row of conditionRows) {
    text(row, M + 8, y, 6, false, gray);
    y += 9;
  }
  const tx = M + width * 0.63,
    tw = width * 0.37;
  let totalY = startY;
  const grossMaterials=draft.items.filter(i=>i.kind==="material").reduce((sum,i)=>sum+gross(i),0);
  const grossServices=draft.items.filter(i=>i.kind==="service").reduce((sum,i)=>sum+gross(i),0);
  const totalDiscount=draft.items.reduce((sum,i)=>sum+discount(i),0);
  for (const [label, value] of [
    ["Peças — subtotal", money(grossMaterials)],
    ["Mão de obra — subtotal", money(grossServices)],
    ["Descontos", "- " + money(totalDiscount)],
  ]) {
    text(label, tx + 8, totalY, 7, false, gray);
    right(value, W - M - 8, totalY);
    totalY += 11;
  }
  rect(tx, totalY, tw, 24);
  text("VALOR TOTAL", tx + 8, totalY + 7, 7, true, white);
  right(
    "R$ " + money(totals.sale),
    W - M - 8,
    totalY + 6,
    11,
    true,
    rgb(0.91, 0.63, 0),
  );
  totalY += 28;
  if (includeTaxes) {
    const taxValues=draft.items.flatMap(item=>{
      const tax=currentTaxes(draft,item);
      return item.kind==='material'?[tax?.icms,tax?.icmsSt,tax?.ipi,tax?.pis,tax?.cofins]:[tax?.pis,tax?.cofins];
    });
    const taxTotal=taxValues.every(value=>typeof value==='number'&&Number.isFinite(value))
      ? 'R$ '+money(taxValues.reduce<number>((sum,value)=>sum+value!,0)) : 'Não informado';
    text('Tributos estimados na proposta',tx+8,totalY,7,true);
    right(taxTotal,W-M-8,totalY,7,true);
    totalY+=10;
    for(const row of wrap('O eventual aproveitamento de créditos deve ser confirmado pela contabilidade do cliente.',tw-16,6)){
      text(row,tx+8,totalY,6,false,gray);
      totalY+=8;
    }
  }
  const summaryBottom = Math.max(y, totalY);
  if (hasBackup) {
    const backupX = M + width * 0.29, backupWidth = width * 0.34 - 12;
    const rows = [
      ...(commercial.backupDays ? [`Prazo previsto de utilização: ${commercial.backupDays} ${commercial.backupDays === '1' ? 'dia' : 'dias'}.`] : []),
      ...wrap(commercial.backupTerms?.trim() || DEFAULT_BACKUP_TERMS, backupWidth, 6),
    ];
    const firstPage = page;
    y = startY;
    const heading = () => { text('CONDIÇÕES DO EQUIPAMENTO BACKUP', backupX, y, 6.5, true); y += 13; };
    heading();
    for (const row of rows) {
      if (y + 12 > H - 55) { newPage(); heading(); }
      text(row, backupX, y, 6, false, gray); y += 9;
    }
    if (page === firstPage) y = Math.max(y, summaryBottom);
  } else y = summaryBottom;
  y += 9;
  // Keep a gap above the fixed footer, moving the panel only when it cannot fit.
  if (y + 40 > H - 44) newPage();
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
  await addProposalFooter(pdf, M);
  return pdf.save();
}
