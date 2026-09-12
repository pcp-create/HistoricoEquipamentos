import { NextResponse } from "next/server";
import { requireUser, Unauthorized } from "@/lib/auth";
import { logDataError } from "@/lib/data-error";
import { productLookup } from "@/lib/product-lookup";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
export async function GET(request: Request) {
  try {
    await requireUser();
    const code = (new URL(request.url).searchParams.get("code") || "").trim();
    if (!/^[1-9]\d{0,17}$/.test(code))
      return json({ error: "Informe o código numérico do material." }, 400);
    return json({ rows: await productLookup(code) });
  } catch (error) {
    if (error instanceof Unauthorized)
      return json({ error: "Sessão expirada." }, 401);
    const code = logDataError("product-lookup", error);
    return json(
      {
        error: "Não foi possível consultar o material. Tente novamente.",
        code,
      },
      503,
    );
  }
}
