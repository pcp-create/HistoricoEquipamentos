import "server-only";
import { database } from "../db";
import { salesProjection } from "./store";

export class SnapshotInputError extends Error {}
export function snapshotPeriod(value: unknown): string {
  if (typeof value !== "string" || !/^20\d{2}-(0[1-9]|1[0-2])$/.test(value))
    throw new SnapshotInputError("Selecione uma competência válida.");
  return value;
}
export async function snapshotList(period: string) {
  return (await database().query(
    "SELECT id,period,label,created_at,created_by FROM web_sales_projection_snapshots WHERE period=$1 ORDER BY created_at DESC,id DESC", [period],
  )).rows;
}
export async function snapshotRead(id: string, period: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new SnapshotInputError("Parcial inválida.");
  const row = (await database().query(
    "SELECT * FROM web_sales_projection_snapshots WHERE id=$1 AND period=$2", [id, period],
  )).rows[0];
  if (!row) throw new SnapshotInputError("Parcial não encontrada nesta competência.");
  return row;
}
export async function snapshotCreate(input: { id?: unknown; period?: unknown; label?: unknown }, email: string) {
  const period = snapshotPeriod(input.period);
  if (typeof input.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.id))
    throw new SnapshotInputError("Identificador inválido.");
  const label = typeof input.label === "string" ? input.label.trim() : "";
  if (!label || label.length > 120) throw new SnapshotInputError("Informe um nome de até 120 caracteres.");
  const existing = (await database().query("SELECT * FROM web_sales_projection_snapshots WHERE id=$1", [input.id])).rows[0];
  if (existing) {
    if (existing.created_by !== email || existing.period !== period || existing.label !== label) throw new SnapshotInputError("Identificador já utilizado.");
    return existing;
  }
  const document = await salesProjection(period);
  if (!document.complete) throw new SnapshotInputError("A integração está incompleta. Atualize a base antes de registrar a parcial.");
  const client = await database().connect();
  try {
    await client.query("BEGIN READ WRITE");
    await client.query("INSERT INTO web_sales_projection_snapshots(id,period,label,created_by,document) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO NOTHING",
      [input.id, period, label, email, JSON.stringify(document)]);
    const row = (await client.query("SELECT * FROM web_sales_projection_snapshots WHERE id=$1", [input.id])).rows[0];
    if (row.created_by !== email || row.period !== period || row.label !== label) throw new SnapshotInputError("Identificador já utilizado.");
    await client.query("COMMIT");
    return row;
  } catch (e) {
    await client.query("ROLLBACK"); throw e;
  } finally { client.release(); }
}
