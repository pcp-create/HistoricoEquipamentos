import "server-only";
import { m8Session } from "../service-orders/m8";
export type InvoiceKind =
  "Peças" | "Serviços" | "Peças e serviços" | "Não identificado";
// Presence is enough to classify; scan further only when a page has deleted items.
export async function invoiceKind(
  company: number,
  id: string,
  session = m8Session,
): Promise<InvoiceKind> {
  if (![1, 2, 27404].includes(company) || !/^[1-9]\d{0,14}$/.test(id))
    throw Error("Documento inválido");
  const m8 = await session(company);
  async function hasItems(kind: "produto" | "servico") {
    for (let page = 1; page <= 20; page++) {
      const rows = await m8(
        `/v1/faturamento/notafiscalvenda/${id}/${kind}?Page=${page}&PageSize=1000`,
      );
      if (
        !Array.isArray(rows) ||
        rows.some((r) => !r || typeof r !== "object" || !r.id)
      )
        throw Error("Itens não confirmados");
      if (rows.some((r) => !r.estaExcluido)) return true;
      if (rows.length < 1000) return false;
    }
    throw Error("Consulta de itens incompleta");
  }
  const [products, services] = await Promise.all([
    hasItems("produto"),
    hasItems("servico"),
  ]);
  return products && services
    ? "Peças e serviços"
    : products
      ? "Peças"
      : services
        ? "Serviços"
        : "Não identificado";
}
