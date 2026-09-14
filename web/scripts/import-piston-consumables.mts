import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import * as XLSX from "xlsx";
import { database } from "../lib/db";

const filename = process.argv[2];
if (!filename)
  throw new Error("Informe a planilha W800/W900; use --apply para gravar.");
const bytes = readFileSync(filename);
const digest = createHash("sha256").update(bytes).digest("hex");
const revision = "pistao-consumiveis:" + digest;
const workbook = XLSX.read(bytes);
const variants: any[] = [],
  entries: any[] = [],
  formatted: any[] = [];
for (const model of ["W800", "W900"]) {
  if (!workbook.Sheets[model]) throw new Error(`Aba ausente: ${model}`);
  const rows = XLSX.utils.sheet_to_json<any[]>(workbook.Sheets[model], {
    header: 1,
    defval: "",
  });
  const id = `pistao:${model}:` + digest.slice(0, 40);
  variants.push({
    id,
    name: `Padrão Wayne · ${model} · Consumíveis de pistão`,
    header: [
      "Padrão construtivo Wayne",
      model,
      "Aplicação somente por modelo",
      String(rows[2][0]),
    ],
    models: [model],
    rules: [],
    issues: [],
  });
  let section = "";
  rows.forEach((r, i) => {
    if (
      ["PARTES COMUNS", "PARTES INCOMUNS", "RESERVATÓRIO"].includes(
        String(r[0]),
      )
    ) {
      section = String(r[0]);
      return;
    }
    if (!section || !r[1] || typeof r[2] !== "number") return;
    const internal = /^\d+$/.test(String(r[3])) ? String(r[3]) : "";
    if (r[2] <= 0 || !Number.isFinite(r[2]))
      throw new Error(`Quantidade inválida ${model}:${i + 1}`);
    const observation = [
      `Quantidade na lista: ${r[2]}.`,
      `Código da vista: ${r[0] || "não informado"}.`,
      `Percentual venda (médio), valor original: ${r[4]}.`,
      String(r[5]),
      "Aplicação por padrão construtivo/modelo; conferir exceções técnicas. Sem intervalo de manutenção informado.",
    ]
      .filter(Boolean)
      .join(" ");
    entries.push({
      id: `${id}:${i + 1}`,
      variant_id: id,
      sheet: model,
      row: i + 1,
      section,
      description: String(r[1]),
      code_original: internal ? `M8:${internal}` : "",
      code: internal ? `M8:${internal}` : "",
      observation,
      interval_original: "",
      interval_hours: null,
      issues: internal ? [] : ["Código M8 não informado na origem (X)."],
    });
    formatted.push({
      "Fabricante / padrão": "Wayne (padrão construtivo)",
      Modelo: model,
      Controle: "Modelo, sem faixa de série",
      Grupo: section,
      "Descrição da peça": r[1],
      Quantidade: r[2],
      "Código M8": internal,
      "Código da vista": String(r[0]),
      "Percentual venda (médio) — original": r[4],
      "Intervalo em horas": "",
      Observações: r[5],
      "Linha de origem": i + 1,
    });
  });
}
if (!entries.length || entries.length > 1000)
  throw new Error("Quantidade de itens inválida");
const output = path.resolve("../docs/catalogos");
mkdirSync(output, { recursive: true });
const normalized = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(
  normalized,
  XLSX.utils.json_to_sheet(formatted),
  "Itens",
);
XLSX.utils.book_append_sheet(
  normalized,
  XLSX.utils.aoa_to_sheet([
    ["Informações"],
    ["Origem: " + path.basename(filename)],
    ["SHA256: " + digest],
    [
      "Códigos são internos M8, não referências genuínas. A coluna de percentual é preservada sem aplicar fórmula de preço.",
    ],
    [
      "Intervalo não informado. Aplicação por modelo; verificar observações técnicas.",
    ],
    [
      "Importação específica: scripts/import-piston-consumables.mts. Não usar o importador genérico de referências genuínas.",
    ],
    ...["W800", "W900"].flatMap((m) =>
      XLSX.utils
        .sheet_to_json<any[]>(workbook.Sheets[m], { header: 1, defval: "" })
        .filter((r) => String(r[0]).startsWith("Foram relacionados"))
        .map((r) => [m, String(r[0])]),
    ),
  ]),
  "Instruções",
);
writeFileSync(
  path.join(output, "consumiveis-w800-w900.xlsx"),
  XLSX.write(normalized, { type: "buffer", bookType: "xlsx" }),
);
const db = database();
try {
  const ids = [
    ...new Set(formatted.map((r) => r["Código M8"]).filter(Boolean)),
  ];
  const found = (
    await db.query(
      "SELECT DISTINCT product_id::text AS id FROM m8_product_catalog WHERE product_id=ANY($1::bigint[]) AND company_id IN(1,2,27404)",
      [ids],
    )
  ).rows.map((r) => r.id);
  const report = {
    source: path.basename(filename),
    sha256: digest,
    managed: true,
    sourceType: "internal-model-consumables",
    items: entries.length,
    models: variants.map((v) => ({
      model: v.models[0],
      items: entries.filter((e) => e.variant_id === v.id).length,
    })),
    missingProducts: ids.filter((id) => !found.includes(id)),
    withoutCode: entries.filter((e) => !e.code).length,
  };
  writeFileSync(
    path.join(output, "consumiveis-w800-w900.report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report));
  if (process.argv.includes("--apply")) {
    const c = await db.connect();
    try {
      await c.query("BEGIN READ WRITE");
      await c.query("SELECT pg_advisory_xact_lock(81015,1)");
      const inserted = await c.query(
        "INSERT INTO manufacturer_revisions(id,filename,report) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING id",
        [revision, report.source, JSON.stringify(report)],
      );
      if (inserted.rowCount) {
        for (const v of variants)
          await c.query(
            "INSERT INTO manufacturer_variants(id,revision_id,name,header,models,rules,issues) VALUES($1,$2,$3,$4,$5,$6,$7)",
            [
              v.id,
              revision,
              v.name,
              JSON.stringify(v.header),
              JSON.stringify(v.models),
              "[]",
              "[]",
            ],
          );
        await c.query(
          `INSERT INTO manufacturer_entries(id,variant_id,sheet,row_number,section,description,code_original,code,observation,interval_original,interval_hours,issues)
    SELECT p.id,p.variant_id,p.sheet,p.row,p.section,p.description,p.code_original,p.code,p.observation,p.interval_original,p.interval_hours,p.issues FROM jsonb_to_recordset($1::jsonb) AS p(id text,variant_id text,sheet text,row integer,section text,description text,code_original text,code text,observation text,interval_original text,interval_hours numeric,issues jsonb)`,
          [JSON.stringify(entries)],
        );
      }
      await c.query("COMMIT");
      console.log(
        inserted.rowCount
          ? "Importação adicional confirmada."
          : "Arquivo já importado; nenhum item duplicado.",
      );
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
} finally {
  await db.end();
}
