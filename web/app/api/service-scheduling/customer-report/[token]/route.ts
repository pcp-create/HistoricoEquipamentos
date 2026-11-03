import { createHash } from "node:crypto";
import { database } from "@/lib/db";
export const runtime = "nodejs";
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!/^[0-9a-f]{64}$/.test(token))
    return new Response("Relatório indisponível.", { status: 404 });
  const row = (
    await database().query(
      "SELECT content,filename FROM web_service_customer_reports WHERE token_hash=$1 AND expires_at>now()",
      [createHash("sha256").update(token).digest("hex")],
    )
  ).rows[0];
  if (!row) return new Response("Link inválido ou expirado.", { status: 404 });
  return new Response(new Uint8Array(row.content), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${row.filename.replace(/[^\w.-]/g, "_")}"`,
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex",
    },
  });
}
