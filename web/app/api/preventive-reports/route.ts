import { alertRecipients } from "@/lib/employees";
import { requireAdmin, Unauthorized, Forbidden } from "@/lib/auth";
import { loadReport } from "@/lib/preventive-reports/load";
import { reportMessage } from "@/lib/preventive-reports/report";
import { reportPdf } from "@/lib/preventive-reports/pdf";
import { reportTokenMatches } from "@/lib/preventive-reports/access";
export const runtime = "nodejs";
export const maxDuration = 60;
const headers = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};
export async function GET(req: Request) {
  try {
    if (req.headers.has("authorization")) {
      if (
        !reportTokenMatches(
          req.headers.get("authorization"),
          process.env.PREVENTIVE_REPORT_TOKEN,
        )
      )
        return Response.json(
          { error: "Credencial inválida." },
          { status: 401, headers },
        );
    } else await requireAdmin();
    const p = new URL(req.url).searchParams,
      kind = p.get("kind"),
      format = p.get("format") || "json";
    if (
      !["weekly", "overdue", "monthly"].includes(kind || "") ||
      !["json", "pdf", "html"].includes(format)
    )
      return Response.json(
        { error: "Use kind=weekly|overdue|monthly e format=json|pdf|html." },
        { status: 400, headers },
      );
    const report = await loadReport(kind as "weekly" | "overdue" | "monthly"),
      message = reportMessage(report),
      filename = `preventivas-${kind}-${report.date}.pdf`;
    if (format === "html")
      return new Response(message.html, {
        headers: {
          ...headers,
          "Content-Type": "text/html; charset=utf-8",
          "Content-Security-Policy":
            "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
        },
      });
    const pdf = await reportPdf(report);
    if (format === "pdf")
      return new Response(Buffer.from(pdf), {
        headers: {
          ...headers,
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    return Response.json(
      {
        recipients: await alertRecipients("preventive"),
        date: report.date,
        kind: report.kind,
        equipmentCount: report.equipmentCount,
        planCount: report.planCount,
        coverage: report.coverage,
        ...message,
        pdf: { filename, base64: Buffer.from(pdf).toString("base64") },
      },
      { headers },
    );
  } catch (e) {
    if (e instanceof Unauthorized || e instanceof Forbidden)
      return Response.json(
        { error: "Acesso restrito à administração." },
        { status: e instanceof Unauthorized ? 401 : 403, headers },
      );
    console.error("Falha ao gerar relatório de preventivas");
    return Response.json(
      {
        error:
          "Não foi possível gerar o relatório. Nenhum envio foi realizado.",
      },
      { status: 503, headers },
    );
  }
}
