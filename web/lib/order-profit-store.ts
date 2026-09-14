import "server-only";
import { database } from "./db";
import { estimatedProfit } from "./order-profit";
export class ProfitInputError extends Error {}
export class ProfitConflict extends Error {}
function validate(company: string, id: string) {
  if (!["1", "2", "27404"].includes(company) || !/^[1-9]\d{0,17}$/.test(id))
    throw new ProfitInputError("OS inválida.");
}
export async function getOrderProfit(company: string, id: string) {
  validate(company, id);
  return (
    (
      await database().query(
        "SELECT document,version,calculated_at,calculated_by FROM web_order_profit WHERE company_id=$1 AND order_id=$2",
        [company, id],
      )
    ).rows[0] || null
  );
}
export async function saveOrderProfit(
  company: string,
  id: string,
  body: unknown,
  email: string,
  displayName?: string,
) {
  validate(company, id);
  if (!body || typeof body !== "object")
    throw new ProfitInputError("Cálculo inválido.");
  const input = body as Record<string, unknown>;
  const amount = (v: unknown, max: number, hours = false) => {
    if (
      typeof v !== "string" ||
      !(hours ? /^\d+(\.\d{1,3})?$/ : /^\d+(\.\d{1,2})?$/).test(v) ||
      Number(v) > max
    )
      throw new ProfitInputError(
        "Informe custo válido com até duas casas decimais e horas com até três.",
      );
    return v;
  };
  const materials = amount(input.materials, 10000000000),
    hours = amount(input.hours, 1000000, true);
  if (
    input.version !== null &&
    (!Number.isSafeInteger(input.version) || Number(input.version) < 1)
  )
    throw new ProfitInputError("Versão inválida.");
  const client = await database().connect();
  try {
    await client.query("BEGIN READ WRITE");
    const order = (
      await client.query(
        "SELECT total_geral FROM m8_ordens_servico WHERE company_id=$1 AND id_m8=$2",
        [company, id],
      )
    ).rows[0];
    if (!order) throw new ProfitInputError("OS não encontrada.");
    const totals = estimatedProfit(
      order.total_geral,
      materials,
      String(Number(hours) * 40),
    );
    if (!totals)
      throw new ProfitInputError("O valor de venda da OS não está disponível.");
    const document = {
      calculated_by_name: displayName || email,
      ...totals,
      revenue: Number(order.total_geral),
      materials: Number(materials),
      hours: Number(hours),
      hourlyRate: 40,
      labor: Math.round(Number(hours) * 4000) / 100,
    };
    const result =
      input.version === null
        ? await client.query(
            "INSERT INTO web_order_profit(company_id,order_id,document,calculated_by) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING document,version,calculated_at,calculated_by",
            [company, id, JSON.stringify(document), email],
          )
        : await client.query(
            "UPDATE web_order_profit SET document=$3,calculated_by=$4,calculated_at=now(),version=version+1 WHERE company_id=$1 AND order_id=$2 AND version=$5 RETURNING document,version,calculated_at,calculated_by",
            [company, id, JSON.stringify(document), email, input.version],
          );
    if (!result.rows.length)
      throw new ProfitConflict(
        "O cálculo foi alterado por outra pessoa. Feche e reabra a OS antes de recalcular.",
      );
    await client.query("COMMIT");
    return result.rows[0];
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
