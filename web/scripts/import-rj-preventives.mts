import { readFileSync, mkdirSync, writeFileSync, copyFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";
import { database } from "../lib/db";
import { parseRjPreventive } from "../lib/manufacturer/rj-preventive-importer";
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const filenames = [
  "Mnt. Prev. - Linha DD - 50 até 250hp - Padrão RJ.ods",
  "Mnt. Prev. - Linha TPF - 15 até 40hp - Padrão RJ.ods",
  "Mnt. Prev. Linha ROTOR - 10 - Padrão RJ.xlsx",
];
const batches = filenames.map((name) =>
  parseRjPreventive(readFileSync(path.join(root, name)), name),
);
const output = path.join(root, "docs/catalogos"),
  archive = path.join(root, ".m8/manufacturer");
mkdirSync(output, { recursive: true });
mkdirSync(archive, { recursive: true, mode: 0o700 });
for (const b of batches) {
  const slug = "preventiva-rj-" + b.report.family.toLowerCase();
  copyFileSync(
    path.join(root, b.report.source),
    path.join(archive, b.report.sha256 + path.extname(b.report.source)),
  );
  writeFileSync(
    path.join(archive, b.report.sha256 + ".report.json"),
    JSON.stringify(b, null, 2) + "\n",
    { mode: 0o600 },
  );
  writeFileSync(
    path.join(output, slug + ".report.json"),
    JSON.stringify(b.report, null, 2) + "\n",
  );
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(b.formatted),
    "Itens",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ["Informações"],
      ["Origem", b.report.source],
      ["SHA256", b.report.sha256],
      ["Natureza", "Padrão interno RJ para equipamentos Metalplan."],
      ...b.report.warnings.map((w) => ["Conferência", w]),
      [
        "Referências compostas",
        "Códigos unidos por + foram separados, preservando a referência original e a quantidade do conjunto. Códigos com / não foram presumidos como equivalentes a outra referência.",
      ],
      [
        "Importação",
        "Usar scripts/import-rj-preventives.mts; não usar o importador genérico.",
      ],
    ]),
    "Instruções",
  );
  writeFileSync(
    path.join(output, slug + ".xlsx"),
    XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }),
  );
  console.log(JSON.stringify(b.report));
}
const db = database();
try {
  const c = await db.connect();
  try {
    await c.query(
      process.argv.includes("--apply") ? "BEGIN READ WRITE" : "BEGIN READ ONLY",
    );
    if (process.argv.includes("--apply"))
      await c.query("SELECT pg_advisory_xact_lock(81015,1)");
    const activeBefore = (
      await c.query("SELECT id FROM manufacturer_revisions WHERE active")
    ).rows.map((r) => r.id);
    for (const b of batches) {
      const existing = (
        await c.query("SELECT id FROM manufacturer_revisions WHERE id=$1", [
          b.revision,
        ])
      ).rows.length;
      if (!process.argv.includes("--apply")) {
        console.log(
          JSON.stringify({
            family: b.report.family,
            alreadyImported: !!existing,
            mode: "dry-run",
          }),
        );
        continue;
      }
      if (!existing) {
        await c.query(
          "INSERT INTO manufacturer_revisions(id,filename,report) VALUES($1,$2,$3)",
          [b.revision, b.report.source, JSON.stringify(b.report)],
        );
        for (const v of b.variants)
          await c.query(
            "INSERT INTO manufacturer_variants(id,revision_id,name,header,models,rules,issues) VALUES($1,$2,$3,$4,$5,$6,$7)",
            [
              v.id,
              b.revision,
              v.name,
              JSON.stringify(v.header),
              JSON.stringify(v.models),
              JSON.stringify(v.rules),
              JSON.stringify(v.issues),
            ],
          );
        await c.query(
          `INSERT INTO manufacturer_entries(id,variant_id,sheet,row_number,section,description,code_original,code,observation,interval_original,interval_hours,issues)
     SELECT p.id,p.variant_id,p.sheet,p.row,p.section,p.description,p.code_original,p.code,p.observation,p.interval_original,p.interval_hours,p.issues FROM jsonb_to_recordset($1::jsonb) AS p(id text,variant_id text,sheet text,row integer,section text,description text,code_original text,code text,observation text,interval_original text,interval_hours numeric,issues jsonb)`,
          [JSON.stringify(b.entries)],
        );
      }
      const count = (
        await c.query(
          "SELECT count(*)::int AS items FROM manufacturer_entries e JOIN manufacturer_variants v ON v.id=e.variant_id WHERE v.revision_id=$1",
          [b.revision],
        )
      ).rows[0].items;
      if (count !== b.entries.length)
        throw Error("Contagem de conferência divergente: " + b.report.family);
      console.log(
        JSON.stringify({
          family: b.report.family,
          items: count,
          status: existing
            ? "Já importado, sem duplicação"
            : "Conferido para gravação",
        }),
      );
    }
    const activeAfter = (
      await c.query("SELECT id FROM manufacturer_revisions WHERE active")
    ).rows.map((r) => r.id);
    if (JSON.stringify(activeBefore) !== JSON.stringify(activeAfter))
      throw Error("Revisão ativa divergente.");
    await c.query("COMMIT");
    console.log(
      process.argv.includes("--apply")
        ? "Importação adicional confirmada; catálogo ativo preservado."
        : "Prévia validada. Nenhuma gravação no banco.",
    );
  } catch (error) {
    await c.query("ROLLBACK");
    throw error;
  } finally {
    c.release();
  }
} finally {
  await db.end();
}
