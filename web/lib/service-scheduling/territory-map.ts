import { AdminInputError } from "../admin-store";
import "server-only";
import { database } from "../db";
import { cityKey } from "../tasks/territories";
const codes: Record<string, number> = { RO:11,AC:12,AM:13,RR:14,PA:15,AP:16,TO:17,MA:21,PI:22,CE:23,RN:24,PB:25,PE:26,AL:27,SE:28,BA:29,MG:31,ES:32,RJ:33,SP:35,PR:41,SC:42,RS:43,MS:50,MT:51,GO:52,DF:53 };
export async function commercialMap() {
  const { rows } = await database().query("SELECT id::text,version,city,uf,seller FROM web_task_territories ORDER BY uf,city");
  const features: any[] = [], missing: string[] = [];
  const results = await Promise.allSettled([...new Set(rows.map(r => r.uf as string))].map(async uf => {
    if (!codes[uf]) throw Error("UF inválida");
    // Public boundaries only are cached; assignments are always read from the database.
    const r = await fetch(`https://raw.githubusercontent.com/tbrugz/geodata-br/master/geojson/geojs-${codes[uf]}-mun.json`, { next: { revalidate: 604800 }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw Error("Malha indisponível");
    const geo = await r.json();
    if (geo.type !== "FeatureCollection" || !Array.isArray(geo.features)) throw Error("Malha inválida");
    return { uf, geo };
  }));
  const meshes = new Map(results.flatMap(r => r.status === "fulfilled" ? [[r.value.uf,r.value.geo] as const] : []));
  const aliases: Record<string, string> = {
    "SC:SAOLOURENCODOESTE": "SAOLOURENCODOOESTE",
    "SC:SAOMIGUELDOESTE": "SAOMIGUELDOOESTE",
    "SP:MOJIDASCRUZES": "MOGIDASCRUZES",
  };
  for (const rule of rows) {
    const feature = meshes.get(rule.uf)?.features.find((f: any) => cityKey(f.properties?.name || "") === (aliases[`${rule.uf}:${cityKey(rule.city)}`] || cityKey(rule.city)));
    if (!feature) { missing.push(`${rule.city}/${rule.uf}`); continue; }
    features.push({ type: "Feature", geometry: feature.geometry, properties: { id: rule.id, version: rule.version, city: rule.city, uf: rule.uf, seller: rule.seller?.trim() || "Sem vendedor" } });
  }
  return { type: "FeatureCollection", features, missing, sellers: [...new Set(rows.map(r => r.seller?.trim() || "Sem vendedor"))].sort() };
}

export async function updateTerritorySeller(b: any, actor: string, db = database()) {
  if (!/^\d+$/.test(String(b?.id)) || !Number.isInteger(b?.version) || typeof b?.seller !== "string" || b.seller.length > 150)
    throw new AdminInputError("Informe um vendedor válido.");
  const c = await db.connect();
  try {
    await c.query("BEGIN READ WRITE");
    const old = (await c.query("SELECT * FROM web_task_territories WHERE id=$1 FOR UPDATE", [b.id])).rows[0];
    if (!old || old.version !== b.version) throw new AdminInputError("Divisão alterada por outro usuário. Recarregue o mapa antes de salvar.");
    const updated = (await c.query("UPDATE web_task_territories SET seller=$2,version=version+1,updated_by=$3,updated_at=now() WHERE id=$1 RETURNING id::text,version,seller", [b.id,b.seller.trim(),actor])).rows[0];
    await c.query("INSERT INTO web_access_events(event,email,actor,details) VALUES('task_territory',$1,$1,$2)", [actor,JSON.stringify({action:"update_seller",before:old,after:{...old,...updated}})]);
    await c.query("COMMIT");
    return updated;
  } catch (e) { await c.query("ROLLBACK"); throw e; } finally { c.release(); }
}
