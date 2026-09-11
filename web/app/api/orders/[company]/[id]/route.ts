import { logDataError } from "@/lib/data-error";
import { NextResponse } from "next/server";
import { requireUser, Unauthorized } from "@/lib/auth";
import { orderDetail } from "@/lib/history";
export const runtime = "nodejs";
export async function GET(
  _request: Request,
  context: { params: Promise<{ company: string; id: string }> },
) {
  try {
    await requireUser();
    const { company, id } = await context.params;
    const result = await orderDetail(company, id);
    return NextResponse.json(
      result || { error: "Ordem de serviço não encontrada." },
      {
        status: result ? 200 : 404,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  } catch (error) {
    const code = error instanceof Unauthorized ? undefined : logDataError("order-detail", error);
    return NextResponse.json(
      {
        code,
        error:
          error instanceof Unauthorized
            ? "Sessão expirada."
            : "Não foi possível abrir esta OS.",
      },
      { status: error instanceof Unauthorized ? 401 : 503 },
    );
  }
}
