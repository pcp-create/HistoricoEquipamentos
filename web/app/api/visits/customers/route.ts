import { requireUser,Unauthorized,Forbidden } from '@/lib/auth';
import { database } from '@/lib/db';
import { visitIdentity } from '@/lib/visits/store';
export const runtime='nodejs';
export async function GET(){try{
 const u=await requireUser(),db=database();await visitIdentity(db,u.email);
 const rows=(await db.query(`SELECT DISTINCT ON(d.person_id) d.person_id::text,d.name,d.document,d.payload,
 COALESCE(l.latitude,p.latitude) latitude,COALESCE(l.longitude,p.longitude) longitude,COALESCE(l.version,0) AS version
 FROM m8_customer_directory d LEFT JOIN web_sales_customer_locations l ON l.customer_key='m8:'||d.person_id::text
 LEFT JOIN LATERAL(SELECT latitude,longitude FROM web_customer_map_points WHERE person_id=d.person_id ORDER BY updated_at DESC LIMIT 1)p ON true
 ORDER BY d.person_id,d.collected_at DESC,d.company_id`)).rows;
 return Response.json({customers:rows.map(r=>({key:'m8:'+r.person_id,name:r.name||'Cliente sem nome',document:r.document||'',city:r.payload?.municipioNome||'',uf:r.payload?.ufSigla||'',address:[r.payload?.logradouro,r.payload?.numero,r.payload?.bairro].filter(Boolean).join(', '),latitude:r.latitude,longitude:r.longitude,locationVersion:r.version,lead:false,in_portfolio:false,lastVisit:null,health:'overdue'})).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'))},{headers:{'Cache-Control':'private, no-store'}});
}catch(e){return Response.json({error:'Não foi possível carregar os clientes.'},{status:e instanceof Unauthorized?401:e instanceof Forbidden?403:503})}}
