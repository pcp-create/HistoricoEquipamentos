import "server-only";
import { database } from "../db";
import { CrmError } from "./model";
import { M8RequestError } from "../service-orders/m8";
import { approvedPrices, currentMinimum } from "./price-approval";

// Every journal write is committed independently of the ERP call and lock transaction.
async function persist(db: any, sql: string, values: any[]) {
  const c = await db.connect();
  try {
    await c.query("BEGIN READ WRITE");
    const result = await c.query(sql, values);
    await c.query("COMMIT");
    return result;
  } catch (error) {
    await c.query("ROLLBACK");
    throw error;
  } finally {
    c.release();
  }
}

/** A durable restoration record is committed before changing the ERP catalogue. */
export async function withTemporaryMinimum(
  row: any,
  call: any,
  write: () => Promise<any>,
  db: any = database(),
) {
  const item = row.items[row.next_item];
  if (!row.m8_id || item?.kind !== "material") return write();
  const code = String(item.payload.produtoId);
  const link = (
    await db.query(
      "SELECT proposal_id,document FROM crm_order_links WHERE submission_id=$1",
      [row.id],
    )
  ).rows[0];
  const lock = await db.connect();
  try {
    await lock.query("BEGIN READ WRITE");
    const acquired = (
      await lock.query(
        "SELECT pg_try_advisory_xact_lock(129001,$1::int) locked",
        [code],
      )
    ).rows[0]?.locked;
    if (!acquired)
      throw new M8RequestError(
        "Outro envio está utilizando este produto. Tente novamente após a conclusão.",
        false,
      );
    const unresolved = (
      await lock.query(
        "SELECT * FROM crm_price_restorations WHERE product_id=$1 AND state<>'restored'",
        [code],
      )
    ).rows[0];
    if (unresolved)
      throw new M8RequestError(
        "Há uma restauração de preço mínimo pendente para o produto " +
          code +
          ". Confira o M8 antes de continuar.",
        true,
      );
    if (!link) return await write();
    const confirmed = (
      await lock.query(
        "SELECT item_result FROM crm_price_restorations WHERE submission_id=$1 AND item_index=$2 AND state='restored' AND item_result IS NOT NULL ORDER BY id DESC LIMIT 1",
        [row.id, row.next_item],
      )
    ).rows[0];
    if (confirmed?.item_result?.id) return confirmed.item_result;
    const minimum = await currentMinimum(call, code),
      price = Number(item.payload.valorUnitario);
    if (price >= minimum) return await write();
    const approval =
      link && (await approvedPrices(lock, link.proposal_id, link.document));
    const approvedItem = approval?.document?.items?.find(
      (i: any) => i.code === code && i.price === price && i.minimum >= minimum,
    );
    if (!approvedItem)
      throw new M8RequestError(
        "Solicite a aprovação dos preços na proposta antes de incluir este produto abaixo do mínimo.",
        false,
      );
    const record = (
      await persist(
        db,
        "INSERT INTO crm_price_restorations(submission_id,product_id,company_id,original_price,temporary_price,item_index,approval_id) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id",
        [
          row.id,
          code,
          row.company_id,
          minimum,
          price,
          row.next_item,
          approval.id,
        ],
      )
    ).rows[0];
    let result: any,
      writeError: any,
      loweringConfirmed = false;
    try {
      await call(
        "/v1/estoque/produto/" + code,
        { precoVendaMinimo: price },
        "PATCH",
      );
      loweringConfirmed = true;
      if ((await currentMinimum(call, code)) !== price)
        throw new Error("Mínimo temporário não confirmado.");
      result = await write();
      if (!Number.isInteger(result?.id) || result.id <= 0)
        throw new M8RequestError(
          "O M8 não confirmou o ID do item incluído.",
          true,
        );
      await persist(
        db,
        "UPDATE crm_price_restorations SET item_result=$2 WHERE id=$1",
        [record.id, JSON.stringify(result)],
      );
    } catch (error) {
      writeError = error;
    }
    try {
      const current = await currentMinimum(call, code);
      if (current !== price && current !== minimum)
        throw new Error(
          "O preço mínimo foi alterado por outro usuário; conferir restauração.",
        );
      if (current !== minimum)
        await call(
          "/v1/estoque/produto/" + code,
          { precoVendaMinimo: minimum },
          "PATCH",
        );
      if ((await currentMinimum(call, code)) !== minimum)
        throw new Error("Restauração não confirmada no M8.");
      // A timed-out PATCH may still finish in the ERP after this read. Quarantine
      // the product for an administrator to check, even if it currently looks restored.
      if (
        !loweringConfirmed &&
        writeError &&
        (!(writeError instanceof M8RequestError) || writeError.uncertain)
      )
        throw new Error(
          "Alteração temporária sem confirmação; conferir processamento no M8 antes de liberar o produto.",
        );
      await persist(
        db,
        "UPDATE crm_price_restorations SET state='restored',restored_at=now(),error=$2 WHERE id=$1",
        [record.id, writeError?.message || null],
      );
    } catch (error) {
      await persist(
        db,
        "UPDATE crm_price_restorations SET error=$2 WHERE id=$1",
        [record.id, (error as Error).message],
      );
      throw new M8RequestError(
        "Restauração do preço mínimo pendente. O item pode já ter sido incluído. Não reenvie antes da conferência no M8.",
        true,
      );
    }
    if (writeError) throw writeError;
    return result;
  } finally {
    try {
      await lock.query("ROLLBACK");
    } finally {
      lock.release();
    }
  }
}

/** Recovery never repeats item creation, even if the previous write was uncertain. */
export async function restorePendingMinimum(
  id: number,
  actor: string,
  db: any = database(),
  session: any = null,
) {
  if (!Number.isSafeInteger(id) || id <= 0)
    throw new CrmError("Restauração inválida.");
  const user = (
    await db.query("SELECT * FROM web_user_access WHERE email=$1", [actor])
  ).rows[0];
  if (!user?.enabled || user.role !== "admin")
    throw new CrmError("A restauração exige administrador ativo.");
  const record = (
    await db.query("SELECT * FROM crm_price_restorations WHERE id=$1", [id])
  ).rows[0];
  if (!record || record.state === "restored") return { restored: !!record };
  const { m8Session } = await import("../service-orders/m8");
  const call = await (session || m8Session)(record.company_id),
    lock = await db.connect();
  try {
    await lock.query("BEGIN READ WRITE");
    const acquired = (
      await lock.query(
        "SELECT pg_try_advisory_xact_lock(129001,$1::int) locked",
        [record.product_id],
      )
    ).rows[0]?.locked;
    if (!acquired) throw new CrmError("O produto ainda está em processamento.");
    const latest = (
      await lock.query("SELECT state FROM crm_price_restorations WHERE id=$1", [
        id,
      ])
    ).rows[0];
    if (!latest || latest.state === "restored") return { restored: !!latest };
    const current = await currentMinimum(call, String(record.product_id)),
      original = Number(record.original_price),
      temporary = Number(record.temporary_price);
    if (current !== original && current !== temporary)
      throw new CrmError(
        "Mínimo divergente: confira a alteração realizada no ERP.",
      );
    if (current !== original)
      await call(
        "/v1/estoque/produto/" + record.product_id,
        { precoVendaMinimo: original },
        "PATCH",
      );
    if ((await currentMinimum(call, String(record.product_id))) !== original)
      throw new CrmError("Restauração não confirmada.");
    await persist(
      db,
      "UPDATE crm_price_restorations SET state='restored',restored_at=now(),error=$2 WHERE id=$1",
      [id, "Restauração conferida por " + actor],
    );
    return { restored: true };
  } finally {
    try {
      await lock.query("ROLLBACK");
    } finally {
      lock.release();
    }
  }
}
