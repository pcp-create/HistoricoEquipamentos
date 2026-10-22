import "server-only";
import type { PoolClient } from "pg";
import { database } from "./db";
export type RegistryKey =
  | "order-types"
  | "quote-types"
  | "payment-terms"
  | "order-statuses"
  | "freight"
  | "service-types"
  | "service-origins"
  | "flow-statuses";
export async function lastManualUpdate(
  key: RegistryKey,
): Promise<string | null> {
  const result = await database().query<{ updated_at: Date }>(
    "SELECT updated_at FROM public.registry_manual_updates WHERE registry_key=$1",
    [key],
  );
  return result.rows[0]?.updated_at.toISOString() ?? null;
}
export async function recordManualUpdate(
  client: Pick<PoolClient, "query">,
  key: RegistryKey,
  email: string,
) {
  await client.query(
    `INSERT INTO public.registry_manual_updates(registry_key,updated_at,updated_by) VALUES($1,clock_timestamp(),$2)
 ON CONFLICT(registry_key) DO UPDATE SET updated_at=EXCLUDED.updated_at,updated_by=EXCLUDED.updated_by`,
    [key, email],
  );
}
