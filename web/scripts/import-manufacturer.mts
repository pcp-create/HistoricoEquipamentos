import { Client } from "pg";
import { readFileSync, mkdirSync, copyFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseManual } from "../lib/manufacturer/importer.ts";
const filename = process.argv[2];
if (!filename) throw new Error("Informe o caminho da planilha .xls ou .xlsx");
const source = path.resolve(filename),
  data = parseManual(readFileSync(source), path.basename(source));
const archive = path.resolve("../.m8/manufacturer");
mkdirSync(archive, { recursive: true, mode: 0o700 });
copyFileSync(source, path.join(archive, data.revision + path.extname(source)));
writeFileSync(
  path.join(archive, data.revision + ".report.json"),
  JSON.stringify(
    {
      ...data.report,
      warnings: data.warnings,
      review: data.entries.filter((e) => e.issues.length),
    },
    null,
    2,
  ),
  { mode: 0o600 },
);
console.log(JSON.stringify(data.report));
if (process.argv.includes("--dry-run")) process.exit(0);
const url = process.env.DATABASE_URL;
if (
  !url ||
  [...new URL(url).searchParams.keys()].some((k) => k.startsWith("ssl"))
)
  throw new Error("Configure DATABASE_URL com TLS pelo certificado");
const db = new Client({
  connectionString: url,
  ssl: {
    rejectUnauthorized: true,
    ca: readFileSync(
      new URL("../certs/supabase-ca.crt", import.meta.url),
      "utf8",
    ),
  },
  connectionTimeoutMillis: 15000,
  statement_timeout: 120000,
});
try {
  await db.connect();
  await db.query("BEGIN");
  await db.query("SELECT pg_advisory_xact_lock(81015,1)");
  const existing = await db.query(
    "SELECT id FROM manufacturer_revisions WHERE id=$1",
    [data.revision],
  );
  if (!existing.rows.length) {
    await db.query(
      "INSERT INTO manufacturer_revisions(id,filename,report) VALUES($1,$2,$3)",
      [
        data.revision,
        data.filename,
        JSON.stringify({ ...data.report, warnings: data.warnings }),
      ],
    );
    await db.query(
      `INSERT INTO manufacturer_variants SELECT p.id,$1,p.name,p.header,p.models,p.rules,p.issues FROM jsonb_to_recordset($2::jsonb) AS p(id text,name text,header jsonb,models jsonb,rules jsonb,issues jsonb)`,
      [data.revision, JSON.stringify(data.variants)],
    );
    await db.query(
      `INSERT INTO manufacturer_entries SELECT p.id,p.variant_id,p.sheet,p."row",p.section,p.description,p.code_original,p.code,p.observation,p.interval_original,p.interval_hours,p.issues FROM jsonb_to_recordset($1::jsonb) AS p(id text,variant_id text,sheet text,"row" integer,section text,description text,code_original text,code text,observation text,interval_original text,interval_hours numeric,issues jsonb)`,
      [JSON.stringify(data.entries)],
    );
  }
  await db.query("UPDATE manufacturer_revisions SET active=false WHERE active");
  await db.query("UPDATE manufacturer_revisions SET active=true WHERE id=$1", [
    data.revision,
  ]);
  await db.query("COMMIT");
  console.log("Catálogo importado e ativado. Revisões anteriores preservadas.");
} catch {
  await db.query("ROLLBACK").catch(() => {});
  console.error(
    "Importação não confirmada. Verifique a migration e a configuração do banco.",
  );
  process.exitCode = 1;
} finally {
  await db.end();
}
