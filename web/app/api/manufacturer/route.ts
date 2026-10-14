import { Forbidden } from "@/lib/auth";
import { NextResponse } from "next/server";
import { requireModule, Unauthorized } from "@/lib/auth";
import { logDataError } from "@/lib/data-error";
import { manualFilters, manufacturerCatalog } from "@/lib/manufacturer/catalog";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request: Request) {
  try {
    const user = await requireModule("crm", "assistencia-tecnica", "suprimentos");
    let filters;
    try {
      filters = manualFilters(new URL(request.url).searchParams);
    } catch (error) {
      return NextResponse.json(
        { error: (error as Error).message },
        { status: 400 },
      );
    }
    return NextResponse.json(
      {
        ...(await manufacturerCatalog(
          filters,
          new URL(request.url).searchParams.get("options") === "intervals",
        )),
        filters,
        email: user.email,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof Forbidden) return Response.json({error:"Acesso ao módulo não permitido."},{status:403});
    if (error instanceof Unauthorized)
      return NextResponse.json(
        { error: "Sua sessão expirou. Entre novamente." },
        { status: 401 },
      );
    const code = logDataError("manufacturer", error);
    return NextResponse.json(
      { error: "Não foi possível consultar o catálogo do fabricante.", code },
      { status: 503 },
    );
  }
}
