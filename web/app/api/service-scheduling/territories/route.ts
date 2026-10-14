import { updateTerritorySeller } from "@/lib/service-scheduling/territory-map";
import { AdminInputError } from "@/lib/admin-store";
import { requireAdmin, sameOrigin, Unauthorized, Forbidden } from "@/lib/auth";
import { commercialMap } from "@/lib/service-scheduling/territory-map";
export const runtime = "nodejs";
export const maxDuration = 30;
export async function GET() {
  try {
    await requireAdmin();
    return Response.json(await commercialMap(), { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    return Response.json({ error: "Não foi possível carregar a divisão comercial." }, { status: e instanceof Unauthorized ? 401 : e instanceof Forbidden ? 403 : 503 });
  }
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return Response.json({error:"Origem inválida."}, {status:403});
  try {
    const user = await requireAdmin();
    const raw = await req.text();
    if (raw.length > 2000) return Response.json({error:"Dados excedem o limite."}, {status:413});
    let body;
    try { body = JSON.parse(raw); } catch { return Response.json({error:"Dados inválidos."}, {status:400}); }
    const result = await updateTerritorySeller(body, user.email);
    return Response.json(result, {headers:{"Cache-Control":"private, no-store"}});
  } catch (e) {
    return Response.json({error: e instanceof AdminInputError ? e.message : "Não foi possível alterar o vendedor."}, {status:e instanceof Unauthorized ? 401 : e instanceof Forbidden ? 403 : e instanceof AdminInputError ? 400 : 503});
  }
}
