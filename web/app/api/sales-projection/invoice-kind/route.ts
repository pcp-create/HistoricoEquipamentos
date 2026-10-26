import { requireUser, Unauthorized, Forbidden } from "@/lib/auth";
import { database } from "@/lib/db";
import { invoiceKind } from "@/lib/sales-projection/invoice-kind";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    await requireUser();
    const params = new URL(request.url).searchParams,
      company = Number(params.get("company")),
      id = params.get("id") || "";
    if (![1, 2, 27404].includes(company) || !/^[1-9]\d{0,14}$/.test(id))
      return Response.json({ error: "Documento inválido." }, { status: 400 });
    const found = await database().query(
      `SELECT 1 FROM m8_commercial_facts WHERE kind='fFaturamento' AND present AND id=$1 AND company_id IN(1,2,27404) AND coalesce(nullif(payload->>'empresaId','')::int,company_id)=$2 LIMIT 1`,
      [id, company],
    );
    if (!found.rows.length)
      return Response.json(
        { error: "Documento não encontrado." },
        { status: 404 },
      );
    return Response.json(
      { kind: await invoiceKind(company, id) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof Unauthorized
            ? "Sua sessão expirou."
            : e instanceof Forbidden
              ? "Acesso não permitido."
              : "Não foi possível consultar os itens da nota no M8.",
      },
      {
        status:
          e instanceof Unauthorized ? 401 : e instanceof Forbidden ? 403 : 503,
      },
    );
  }
}
