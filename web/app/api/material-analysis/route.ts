import { logDataError } from "@/lib/data-error";
import { NextResponse } from "next/server";
import { requireUser, Unauthorized } from "@/lib/auth";
import { parseAnalysis } from "@/lib/material-planning";
import { materialAnalysis } from "@/lib/material-analysis";
import { csvCell } from "@/lib/filters";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const params = new URL(request.url).searchParams;
    let filters;
    try {
      filters = parseAnalysis(params);
    } catch (error) {
      return NextResponse.json(
        { error: (error as Error).message },
        { status: 400 },
      );
    }
    const exporting = params.get("export") === "csv";
    const data = await materialAnalysis(filters, exporting);
    if (exporting) {
      const header = [
        "Empresa",
        "Código",
        "Material",
        "Referência fabricante",
        "Unidade",
        "Quantidade aplicada",
        "OS com aplicação",
        "Dias com aplicação",
        "Média por dia",
        "Média por 30 dias",
        "Mínimo / ponto de pedido simulado",
        "Máximo simulado",
        "Observação",
        "Início",
        "Fim",
        "Dias analisados",
        "Reposição (dias)",
        "Segurança (dias)",
        "Revisão (dias)",
        "OS processadas na empresa",
        "OS completas na empresa",
      ];
      const lines = data.rows.map((r) => {
        const c = data.coverage.find((c) => c.company_id === r.company_id);
        return [
          r.company_id,
          r.product_id,
          r.name,
          r.reference,
          r.unit,
          r.quantity,
          r.orders,
          r.active_days,
          r.daily,
          r.monthly,
          r.minimum,
          r.maximum,
          r.reason || "Simulação; não considera saldo e pedidos em aberto",
          filters.from,
          filters.to,
          filters.days,
          filters.lead,
          filters.safety,
          filters.review,
          c?.eligible,
          c?.complete,
        ]
          .map(csvCell)
          .join(";");
      });
      return new Response(
        "\uFEFF" + [header.map(csvCell).join(";"), ...lines].join("\r\n"),
        {
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition":
              'attachment; filename="analise-materiais.csv"',
            "Cache-Control": "private, no-store",
          },
        },
      );
    }
    return NextResponse.json(
      { ...data, email: user.email },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    const code = error instanceof Unauthorized ? undefined : logDataError("material-analysis", error);
    return NextResponse.json(
      {
        code,
        error:
          error instanceof Unauthorized
            ? "Sua sessão expirou. Entre novamente."
            : "Não foi possível carregar a análise. Tente reduzir o período.",
      },
      { status: error instanceof Unauthorized ? 401 : 503 },
    );
  }
}
