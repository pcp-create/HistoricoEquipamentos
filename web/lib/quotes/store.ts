import "server-only";
import { randomUUID } from "node:crypto";
import { database } from "../db";
import { parseQuote, quoteTotals } from "./types";
export class QuoteConflict extends Error {}
export async function listQuotes(search = "") {
  const pattern =
    "%" +
    search
      .trim()
      .slice(0, 120)
      .replace(/[\\%_]/g, "\\$&") +
    "%";
  return (
    await database().query(
      `SELECT id,number::text,version,client_name,equipment,service_type,total_cents::text,updated_at,updated_by,document->>'responsible' AS responsible,COALESCE((document->>'pendingAmounts')::boolean,false) AS pending_amounts
    FROM web_quotes WHERE concat_ws(' ',number,client_name,equipment,service_type,document->>'responsible') ILIKE $1 ORDER BY updated_at DESC LIMIT 100`,
      [pattern],
    )
  ).rows;
}
export async function getQuote(id: string) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  )
    return null;
  const r = (
    await database().query(
      "SELECT id,number::text,version,document,updated_at,updated_by FROM web_quotes WHERE id=$1",
      [id],
    )
  ).rows[0];
  return r
    ? {
        ...r.document,
        id: r.id,
        version: r.version,
        number: r.number,
        updated_at: r.updated_at,
        updated_by: r.updated_by,
      }
    : null;
}
export async function saveQuote(input: unknown, email: string) {
  const quote = parseQuote(input),
    id = quote.id || randomUUID(),
    totals = quoteTotals(quote.items),
    total = totals.total;
  const client = await database().connect();
  try {
    // Keep the shared pool read-only by default; only this transaction writes the internal draft table.
    await client.query("BEGIN READ WRITE");
    const args = [
      id,
      Number(quote.company),
      quote.client,
      quote.equipment,
      quote.serviceType,
      JSON.stringify({ ...quote, pendingAmounts: totals.invalid > 0 }),
      total,
      email,
    ];
    const result = quote.id
      ? await client.query(
          `UPDATE web_quotes SET company_id=$2,client_name=$3,equipment=$4,service_type=$5,document=$6,total_cents=$7,updated_by=$8,updated_at=now(),version=version+1
          WHERE id=$1 AND version=$9 RETURNING id,number::text,version`,
          [...args, quote.version],
        )
      : await client.query(
          `INSERT INTO web_quotes(id,company_id,client_name,equipment,service_type,document,total_cents,created_by,updated_by)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$8) RETURNING id,number::text,version`,
          args,
        );
    if (!result.rows.length)
      throw new QuoteConflict(
        "Este orçamento foi alterado por outra pessoa. Reabra a versão atual antes de salvar.",
      );
    await client.query("COMMIT");
    return { ...quote, ...result.rows[0] };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
