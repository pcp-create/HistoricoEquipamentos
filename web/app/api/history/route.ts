import { NextResponse } from "next/server";
import { requireUser, Unauthorized } from "@/lib/auth";
import { history, overview } from "@/lib/history";
import { csvCell, parseFilters } from "@/lib/filters";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const params = new URL(request.url).searchParams;
    if (params.get("overview") === "1")
      return NextResponse.json(
        { ...(await overview()), email: user.email },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    let filters;
    try {
      filters = parseFilters(params);
    } catch (error) {
      return NextResponse.json(
        { error: (error as Error).message },
        { status: 400 },
      );
    }
    const exporting = params.get("export") === "csv";
    const result = await history(filters, exporting);
    if (exporting) {
      const columns = {
        company_id: "Empresa",
        id: "ID OS",
        number: "Número OS",
        date: "Data OS",
        client: "Cliente",
        document: "CPF/CNPJ",
        equipment: "Equipamento",
        model: "Modelo",
        serial: "Número de série",
        status: "Status",
        situation: "Situação",
        ...(filters.view === "materials"
          ? {
              material: "Material",
              item_status: "Situação do material",
              reference: "Referência do fabricante",
              product_id: "Código do produto",
              quantity: "Quantidade",
              unit: "Unidade",
            }
          : {
              materials: "Itens de material",
              excluded_materials: "Itens excluídos",
            }),
        amount: "Valor total",
        detail_at: "Detalhes atualizados em",
      };
      const csv = [
        Object.values(columns).map(csvCell).join(";"),
        ...result.rows.map((row) =>
          Object.keys(columns)
            .map((key) =>
              csvCell(
                row[key] instanceof Date ? row[key].toISOString() : row[key],
              ),
            )
            .join(";"),
        ),
      ].join("\r\n");
      return new Response("\uFEFF" + csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="historico-${filters.view}.csv"`,
          "Cache-Control": "private, no-store",
        },
      });
    }
    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof Unauthorized)
      return NextResponse.json(
        { error: "Sua sessão expirou. Entre novamente." },
        { status: 401 },
      );
    if (error instanceof Error && error.message === "EXPORT_LIMIT")
      return NextResponse.json(
        {
          error: "A exportação aceita até 20.000 registros. Refine os filtros.",
        },
        { status: 422 },
      );
    console.error("Falha na consulta do histórico");
    return NextResponse.json(
      {
        error:
          "Não foi possível consultar o histórico. Tente novamente ou refine a pesquisa.",
      },
      { status: 503 },
    );
  }
}
