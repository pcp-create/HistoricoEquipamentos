import "server-only";
import { database } from "./db";
export class OrderLinkInputError extends Error {}
export class OrderLinkConflict extends Error {}
function validate(company: string, id: string) {
  if (!["1", "2", "27404"].includes(company) || !/^[1-9]\d{0,17}$/.test(id))
    throw new OrderLinkInputError("OS inválida.");
}
export async function orderLinks(
  company: string,
  id: string,
  query: string | null,
  page = 0,
) {
  validate(company, id);
  if (query !== null) {
    if (
      query.length > 200 ||
      !Number.isInteger(page) ||
      page < 0 ||
      page > 100000
    )
      throw new OrderLinkInputError("Pesquisa inválida.");
    const terms = query.trim().split(/\s+/).filter(Boolean);
    const rows = (
      await database().query(
        `SELECT company_id,id_m8::text id,coalesce(numero_sequencia,id_m8)::text number,cliente_nome, equipamento,status_lancamento_nome FROM m8_ordens_servico o WHERE company_id IN(1,2,27404) AND NOT(company_id=$1 AND id_m8=$2) AND NOT EXISTS(SELECT 1 FROM unnest($3::text[]) term WHERE strpos(lower(concat_ws(' ',numero_sequencia,id_m8,cliente_nome,equipamento,status_lancamento_nome)),lower(term))=0) ORDER BY coalesce(emissao,data_abertura) DESC NULLS LAST,company_id,id_m8 DESC LIMIT 51 OFFSET $4`,
        [company, id, terms, page * 50],
      )
    ).rows;
    return { orders: rows.slice(0, 50), hasMore: rows.length > 50 };
  }
  const link =
    (
      await database().query(
        `SELECT l.*,o.numero_sequencia,o.cliente_nome,o.status_lancamento_nome FROM web_order_links l LEFT JOIN m8_ordens_servico o ON o.company_id=l.linked_company_id AND o.id_m8=l.linked_order_id WHERE l.company_id=$1 AND l.order_id=$2`,
        [company, id],
      )
    ).rows[0] || null;
  return { link };
}
export async function saveOrderLink(
  company: string,
  id: string,
  b: any,
  email: string,
) {
  validate(company, id);
  if (!b || (b.version !== null && !Number.isInteger(b.version)))
    throw new OrderLinkInputError("Vínculo inválido.");
  if (b.target !== null) {
    validate(String(b.target?.company), String(b.target?.id));
    if (String(b.target.company) === company && String(b.target.id) === id)
      throw new OrderLinkInputError(
        "Não é possível vincular a OS a ela mesma.",
      );
  }
  const c = await database().connect();
  try {
    await c.query("BEGIN READ WRITE");
    const source = (
      await c.query(
        "SELECT id_m8 FROM m8_ordens_servico WHERE company_id=$1 AND id_m8=$2 FOR UPDATE",
        [company, id],
      )
    ).rows[0];
    if (!source) throw new OrderLinkInputError("OS não encontrada.");
    const old = (
      await c.query(
        "SELECT * FROM web_order_links WHERE company_id=$1 AND order_id=$2",
        [company, id],
      )
    ).rows[0];
    if ((old?.version ?? null) !== b.version)
      throw new OrderLinkConflict("O vínculo foi alterado. Atualize a página.");
    if (
      b.target &&
      !(
        await c.query(
          "SELECT id_m8 FROM m8_ordens_servico WHERE company_id=$1 AND id_m8=$2",
          [b.target.company, b.target.id],
        )
      ).rows.length
    )
      throw new OrderLinkInputError("OS vinculada não encontrada.");
    const link = (
      await c.query(
        `INSERT INTO web_order_links(company_id,order_id,linked_company_id,linked_order_id,updated_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT(company_id,order_id) DO UPDATE SET linked_company_id=excluded.linked_company_id,linked_order_id=excluded.linked_order_id,updated_by=excluded.updated_by,updated_at=now(),version=web_order_links.version+1 RETURNING *`,
        [company, id, b.target?.company ?? null, b.target?.id ?? null, email],
      )
    ).rows[0];
    await c.query(
      "INSERT INTO web_access_events(event,email,actor,details) VALUES($1,$2,$2,$3)",
      [
        "order_link_updated",
        email,
        JSON.stringify({ company, id, before: old || null, after: link }),
      ],
    );
    await c.query("COMMIT");
    return { link };
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
