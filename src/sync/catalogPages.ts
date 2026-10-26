import type { M8Client } from "../m8/client.js";
import { listData } from "../m8/collections.js";
import { id } from "../m8/ordemServico.js";
import { SafeError } from "../utils/logger.js";

// Reconcile only a complete, validated snapshot. Repeated pages are an error.
export async function catalogPages(
  client: Pick<M8Client, "get">,
  path: string,
  shouldStop?: () => boolean,
) {
  const rows: Record<string, unknown>[] = [],
    seen = new Set<string>();
  for (let page = 1; page <= 10000; page++) {
    if (shouldStop?.())
      throw new SafeError("Coleta interrompida; snapshot anterior preservado");
    const batch = listData(
      await client.get(path, { Page: page, PageSize: 500 }),
    );
    for (const row of batch) {
      const key = id(row.id);
      if (key === "0" || seen.has(key))
        throw new SafeError(
          "ID inválido ou repetido entre páginas; snapshot anterior preservado",
        );
      seen.add(key);
      rows.push(row);
    }
    if (batch.length < 500) return rows;
  }
  throw new SafeError(
    "Limite de páginas atingido; snapshot anterior preservado",
  );
}
