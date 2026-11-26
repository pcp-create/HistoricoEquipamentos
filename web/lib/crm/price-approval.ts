import "server-only";
import { database } from "../db";
import { CrmError, uuid } from "./model";
import { getProposal } from "./store";
import { reviewItemPrices } from "./item-price-approval";
export async function currentMinimum(call: any, code: string) {
  const rows = await call(
    "/v1/estoque/produto?Id=" +
      encodeURIComponent(code) +
      "&Page=1&PageSize=10",
  );
  const product = (Array.isArray(rows) ? rows : []).find(
    (p: any) => String(p.id) === String(code),
  );
  if (
    !product ||
    product.precoVendaMinimo == null ||
    !Number.isFinite(Number(product.precoVendaMinimo)) ||
    Number(product.precoVendaMinimo) < 0
  )
    throw new CrmError(
      "Não foi possível confirmar o preço mínimo do produto " + code + ".",
    );
  return Number(product.precoVendaMinimo);
}
export async function priceReview(id: string, orderType: string) {
  const p = await getProposal(uuid(id));
  const active = (
    await database().query(
      "SELECT document FROM crm_order_links WHERE proposal_id=$1 AND state NOT IN ('complete','validation_failed') ORDER BY created_at DESC LIMIT 1",
      [id],
    )
  ).rows[0];
  const draft = active?.document || {
    ...p.document,
    type: orderType || p.document.type,
  };
  const result = await reviewItemPrices(database(), id, draft, p.lead_id || "");
  return { ...result, users: [], draft, version: p.version, number: p.number };
}
