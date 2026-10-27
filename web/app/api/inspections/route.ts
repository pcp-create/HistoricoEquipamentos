import { database } from "@/lib/db";
import { searchPatterns } from "@/lib/filters";
import { requireUser, sameOrigin, Unauthorized, Forbidden } from "@/lib/auth";
import {
  inspectionsData,
  saveInspection,
  InspectionInputError,
  InspectionConflict,
} from "@/lib/inspections/store";
export const runtime = "nodejs";
export const maxDuration = 60;
const json = (v: unknown, status = 200) =>
  Response.json(v, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
function fail(e: unknown) {
  return json(
    {
      error:
        e instanceof InspectionInputError || e instanceof InspectionConflict
          ? e.message
          : e instanceof Unauthorized
            ? "Sessão expirada."
            : e instanceof Forbidden
              ? "Acesso não permitido."
              : "Não foi possível carregar ou salvar as inspeções.",
    },
    e instanceof Unauthorized
      ? 401
      : e instanceof Forbidden
        ? 403
        : e instanceof InspectionConflict
          ? 409
          : e instanceof InspectionInputError
            ? 400
            : 503,
  );
}
export async function GET(r: Request) {
  try {
    const u = await requireUser();
    const p = new URL(r.url).searchParams;
    if (p.has("customers")) {
      const page = Number(p.get("page") || 1);
      if (!Number.isInteger(page) || page < 1)
        throw new InspectionInputError("Página inválida.");
      const rows = (
        await database().query(
          `SELECT person_id::text AS id,name,concat_ws(' · ',document,payload->>'municipioNome',payload->>'ufSigla') detail FROM (SELECT DISTINCT ON(person_id) person_id,name,document,payload FROM m8_customer_directory WHERE company_id IN(1,2,27404) ORDER BY person_id,(company_id=1) DESC,collected_at DESC)d WHERE concat_ws(' ',name,document,payload->>'municipioNome') ILIKE ALL($1::text[]) ORDER BY name,person_id LIMIT 31 OFFSET $2`,
          [searchPatterns((p.get("q") || "").slice(0, 200)), (page - 1) * 30],
        )
      ).rows;
      return json({ rows: rows.slice(0, 30), hasMore: rows.length > 30 });
    }
    return json(await inspectionsData(u.email, p));
  } catch (e) {
    return fail(e);
  }
}
export async function POST(r: Request) {
  if (!sameOrigin(r)) return json({ error: "Origem inválida." }, 403);
  try {
    const u = await requireUser();
    const raw = await r.text();
    if (raw.length > 16000)
      throw new InspectionInputError("Dados excedem o limite.");
    let b;
    try {
      b = JSON.parse(raw);
    } catch {
      throw new InspectionInputError("Dados inválidos.");
    }
    if (!b || typeof b !== "object")
      throw new InspectionInputError("Dados inválidos.");
    return json(await saveInspection(b, u.email));
  } catch (e) {
    return fail(e);
  }
}
