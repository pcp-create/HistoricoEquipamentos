import { requireAdmin, sameOrigin, Unauthorized, Forbidden } from "@/lib/auth";
import {
  orderReportPdf,
  OrderReportInputError,
  OrderReportConflict,
} from "@/lib/service-scheduling/order-report-store";
export const runtime = "nodejs";
export async function POST(req: Request) {
  const json = (error: string, status: number) =>
    Response.json(
      { error },
      { status, headers: { "Cache-Control": "private, no-store" } },
    );
  if (!sameOrigin(req)) return json("Origem inválida.", 403);
  try {
    const user = await requireAdmin();
    let body;
    try {
      body = await req.json();
    } catch {
      return json("Dados inválidos.", 400);
    }
    const result = await orderReportPdf(body, user.email);
    return new Response(new Uint8Array(result.bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${result.filename}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    if (e instanceof Unauthorized) return json("Sessão expirada.", 401);
    if (e instanceof Forbidden)
      return json("Você não tem permissão para gerar este relatório.", 403);
    if (e instanceof OrderReportInputError) return json(e.message, 400);
    if (e instanceof OrderReportConflict) return json(e.message, 409);
    console.error("ORDER_REPORT_EXPORT_FAILED");
    return json(
      "Não foi possível gerar o relatório da OS. Tente novamente.",
      503,
    );
  }
}
