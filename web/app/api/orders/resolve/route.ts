import { requireUser, Unauthorized } from "@/lib/auth";
import { database } from "@/lib/db";
export async function GET(req: Request) {
  try {
    await requireUser();
    const p = new URL(req.url).searchParams,
      number = p.get("number") || "",
      equipment = p.get("equipment");
    if (
      !/^[1-9]\d{0,17}$/.test(number) ||
      (equipment && !/^[1-9]\d{0,17}$/.test(equipment))
    )
      return Response.json(
        { error: "Número de OS inválido." },
        { status: 400 },
      );
    const rows = (
      await database().query(
        `SELECT o.company_id,o.id_m8::text id,coalesce(o.numero_sequencia,o.id_m8)::text number,o.cliente_nome customer FROM m8_ordens_servico o WHERE o.company_id IN(1,2,27404) AND (o.id_m8=$1 OR o.numero_sequencia=$1) AND ($2::bigint IS NULL OR EXISTS(SELECT 1 FROM m8_order_equipment_links l WHERE l.company_id=o.company_id AND l.order_id=o.id_m8 AND l.equipment_id=$2 AND NOT l.stale)) ORDER BY o.company_id,o.id_m8 LIMIT 20`,
        [number, equipment],
      )
    ).rows;
    return Response.json(
      { orders: rows },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof Unauthorized
            ? "Sessão expirada."
            : "Não foi possível localizar esta OS.",
      },
      { status: e instanceof Unauthorized ? 401 : 503 },
    );
  }
}
