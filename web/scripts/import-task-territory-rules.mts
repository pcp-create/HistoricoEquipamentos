import * as XLSX from "xlsx";
import { Client } from "pg";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
const bytes = readFileSync(
    new URL("../../Divisão Vendedores Comercial.xlsx", import.meta.url),
  ),
  w = XLSX.read(bytes, { type: "buffer" });
const rows: any[][] = XLSX.utils.sheet_to_json(
  w.Sheets["Divisões administrativas"],
  { header: 1, defval: "" },
);
const fold = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
const names: any = {
  HENRIQUE: "Henrique Medeiros",
  HENRIQUEMEDEIROS: "Henrique Medeiros",
  MAICK: "Maick Coelho",
  MAICKCOELHO: "Maick Coelho",
};
const db = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: true,
    ca: readFileSync(
      new URL("../certs/supabase-ca.crt", import.meta.url),
      "utf8",
    ),
  },
});
try {
  await db.connect();
  await db.query("BEGIN");
  await db.query(
    readFileSync(
      new URL("../sql/013_task_territories.sql", import.meta.url),
      "utf8",
    ),
  );
  await db.query(
    readFileSync(
      new URL("../sql/014_task_territory_columns.sql", import.meta.url),
      "utf8",
    ),
  );
  const users = (
    await db.query(
      "SELECT email,display_name FROM web_user_access WHERE enabled AND display_name IN ('Maick Coelho','Henrique Medeiros')",
    )
  ).rows;
  const unique = new Map<string, any>();
  for (const r of rows.slice(1)) {
    if (!r[0] && !r[4]) continue;
    const city = String(r[0]).trim(),
      uf = String(r[4]).trim().toUpperCase();
    const found = users.filter(
      (u) => u.display_name === names[fold(String(r[5]))],
    );
    if (found.length !== 1) throw Error("Responsável não identificado");
    const entry = {
      city,
      city_key: fold(city),
      uf,
      assignee: found[0].email,
      mesoregion: String(r[1]).trim(),
      microregion: String(r[2]).trim(),
      seller: String(r[3]).trim(),
    };
    const key = entry.city_key + ":" + uf;
    if (unique.has(key) && unique.get(key).assignee !== entry.assignee)
      throw Error("Divisão conflitante");
    unique.set(key, entry);
  }
  const inserted = await db.query(
    `INSERT INTO web_task_territories(city,city_key,uf,assignee,updated_by) SELECT city,city_key,uf,assignee,'importacao:divisao-comercial' FROM jsonb_to_recordset($1::jsonb) x(city text,city_key text,uf text,assignee text) ON CONFLICT(city_key,uf) DO NOTHING RETURNING id`,
    [JSON.stringify([...unique.values()])],
  );
  const enriched = await db.query(
    `UPDATE web_task_territories t SET
    mesoregion=coalesce(t.mesoregion,x.mesoregion), microregion=coalesce(t.microregion,x.microregion), seller=coalesce(t.seller,x.seller),
    version=version+1,updated_at=now(),updated_by='importacao:divisao-comercial'
    FROM jsonb_to_recordset($1::jsonb) x(city_key text,uf text,mesoregion text,microregion text,seller text)
    WHERE t.city_key=x.city_key AND t.uf=x.uf AND (t.mesoregion IS NULL OR t.microregion IS NULL OR t.seller IS NULL) RETURNING t.id`,
    [JSON.stringify([...unique.values()])],
  );
  const report = {
    enriched: enriched.rowCount,
    source: "Divisão Vendedores Comercial.xlsx",
    sha256: createHash("sha256").update(bytes).digest("hex"),
    rules: unique.size,
    inserted: inserted.rowCount,
    notifications: 0,
  };
  await db.query(
    "INSERT INTO web_access_events(event,email,actor,details) VALUES('task_territory_import','Sistema','Sistema',$1)",
    [JSON.stringify(report)],
  );
  await db.query("COMMIT");
  writeFileSync(
    new URL("../../.m8/task-territories/rules-import.json", import.meta.url),
    JSON.stringify(report, null, 2),
    { mode: 0o600 },
  );
  console.log(JSON.stringify(report));
} catch (e) {
  await db.query("ROLLBACK");
  throw e;
} finally {
  await db.end();
}
