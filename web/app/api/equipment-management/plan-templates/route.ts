import { requireUser, Unauthorized } from "@/lib/auth";
import { database } from "@/lib/db";
export const runtime = "nodejs";
export async function GET(req: Request) {
  try {
    await requireUser();
    const p = new URL(req.url).searchParams;
    const q = (p.get("q") || "").trim().slice(0,160);
    const page = Math.max(0, Math.min(10000, Number(p.get("page")) || 0));
    const result = await database().query(`SELECT p.id,p.document,e.equipment_id::text,e.name AS equipment_name,e.serial
      FROM web_equipment_plans p JOIN m8_equipment_catalog e ON e.equipment_id=p.equipment_id
      WHERE NOT p.archived AND ($1='' OR concat_ws(' ',p.document->>'name',e.name,e.serial,e.equipment_id::text) ILIKE '%' || $1 || '%')
      ORDER BY p.document->>'name',p.id LIMIT 31 OFFSET $2`,[q,Math.floor(page)*30]);
    return Response.json({rows:result.rows.slice(0,30),hasMore:result.rows.length>30},{headers:{"Cache-Control":"private, no-store"}});
  } catch(e) { return Response.json({error:"Não foi possível consultar os planos."},{status:e instanceof Unauthorized?401:503}); }
}
