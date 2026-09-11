import { priceComparison } from "@/lib/product-values";
import { logDataError } from "@/lib/data-error";
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
      result.rows = result.rows.map((row) => {
        const comparison = priceComparison(
          row.amount,
          row.quantity,
          row.unit,
          row.current,
          row.is_excluded,
        );
        return {
          ...row,
          sale_price: row.current?.sale_price,
          minimum_price: row.current?.minimum_price,
          stock: row.current?.stock,
          available: row.current?.available,
          stock_value: row.current?.stock_value,
          stock_unit: row.current?.unit,
          price_at: row.current?.price_at,
          stock_at: row.current?.stock_at,
          available_at: row.current?.available_at,
          effective_unit: comparison.effective,
          minimum_difference: comparison.difference,
          minimum_percent: comparison.percent,
        };
      });
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
              effective_unit: "Total do item dividido pela quantidade",
              sale_price: "Preço de venda atual",
              minimum_price: "Preço mínimo atual",
              minimum_difference: "Diferença do mínimo atual (R$)",
              minimum_percent: "Diferença do mínimo atual (%)",
              stock: "Estoque atual da empresa",
              available: "Estoque disponível atual da empresa",
              stock_unit: "Unidade do estoque",
              stock_value: "Valor estimado a custo médio",
              price_at: "Preços verificados em",
              stock_at: "Estoque coletado em",
              available_at: "Disponível coletado em",
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
    const code = logDataError("history", error);
    return NextResponse.json(
      {
        code,
        error:
          "Não foi possível consultar o histórico. Tente novamente ou refine a pesquisa.",
      },
      { status: 503 },
    );
  }
}
