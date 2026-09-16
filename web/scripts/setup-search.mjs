import { Client } from "pg";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("Configure DATABASE_URL");
if (
  [...new URL(connectionString).searchParams.keys()].some((k) =>
    k.startsWith("ssl"),
  )
)
  throw new Error("Configure TLS pelo certificado");
const db = new Client({
  connectionString,
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
  await db.query("SELECT pg_advisory_xact_lock(81009,1)");
  await db.query(
    "CREATE TABLE IF NOT EXISTS public.web_history_migrations(name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())",
  );
  await db.query(
    "ALTER TABLE public.web_history_migrations ENABLE ROW LEVEL SECURITY",
  );
  await db.query("REVOKE ALL ON public.web_history_migrations FROM PUBLIC");
  await db.query(
    "DO $$ BEGIN IF EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON public.web_history_migrations FROM anon,authenticated; END IF; END $$",
  );
  for (const name of [
    "001_search.sql",
    "002_search_index.sql",
    "003_include_excluded_materials.sql",
    "004_manufacturer.sql",
    "005_quotes.sql",
    "006_order_profit.sql",
    "007_equipment_preventive.sql",
    "008_administration.sql",
  ]) {
    const sql = readFileSync(
      new URL("../sql/" + name, import.meta.url),
      "utf8",
    );
    const checksum = createHash("sha256").update(sql).digest("hex");
    const old = await db.query(
      "SELECT checksum FROM public.web_history_migrations WHERE name=$1",
      [name],
    );
    if (old.rows.length) {
      if (old.rows[0].checksum !== checksum)
        throw new Error("Checksum divergente");
      console.log(name + ": já aplicada");
      continue;
    }
    await db.query(sql);
    await db.query(
      "INSERT INTO public.web_history_migrations(name,checksum) VALUES($1,$2)",
      [name, checksum],
    );
    console.log(name + ": preparada");
  }
  await db.query("COMMIT");
  console.log("Índice de pesquisa pronto");
} catch {
  await db.query("ROLLBACK").catch(() => {});
  console.error(
    "Falha ao preparar pesquisa. Nenhuma migration desta execução foi confirmada.",
  );
  process.exitCode = 1;
} finally {
  await db.end();
}
