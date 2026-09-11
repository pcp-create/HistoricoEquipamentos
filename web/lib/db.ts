import "server-only";
import { Pool } from "pg";
import { readFileSync } from "node:fs";
import path from "node:path";

const globalDb = globalThis as unknown as { historyPool?: Pool };
export function database() {
  if (globalDb.historyPool) return globalDb.historyPool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Banco não configurado");
  const url = new URL(connectionString);
  for (const key of url.searchParams.keys()) {
    if (key.startsWith("ssl"))
      throw new Error("Configure TLS pelo certificado");
  }
  globalDb.historyPool = new Pool({
    connectionString,
    max: 3,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000,
    statement_timeout: 25000,
    options: "-c default_transaction_read_only=on",
    ssl: {
      rejectUnauthorized: true,
      ca: readFileSync(
        path.join(process.cwd(), "certs", "supabase-ca.crt"),
        "utf8",
      ),
    },
  });
  globalDb.historyPool.on("error", () =>
    console.error("Conexão de consulta interrompida"),
  );
  return globalDb.historyPool;
}
