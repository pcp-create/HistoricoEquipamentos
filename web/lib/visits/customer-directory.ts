
import { matchesSearch } from "@/lib/filters";
import "server-only";
import {database} from "../db";
import {customerTradeName} from "./model";
export async function visitCustomerDirectory(query:string|null=null,page=1) {
 const db=database();
 const rows=(await db.query(`SELECT DISTINCT ON(d.person_id) d.person_id::text,d.name,d.document,d.payload,
 COALESCE(l.latitude,p.latitude) latitude,COALESCE(l.longitude,p.longitude) longitude,COALESCE(l.version,0) AS version
 FROM m8_customer_directory d LEFT JOIN web_sales_customer_locations l ON l.customer_key='m8:'||d.person_id::text
 LEFT JOIN LATERAL(SELECT latitude,longitude FROM web_customer_map_points WHERE person_id=d.person_id ORDER BY updated_at DESC LIMIT 1)p ON true
 ORDER BY d.person_id,d.collected_at DESC,d.company_id`)).rows;
 const customers = rows.map(r=>({key:'m8:'+r.person_id,name:r.name||'Cliente sem nome',tradeName:customerTradeName(r.payload),document:r.document||'',city:r.payload?.municipioNome||'',uf:r.payload?.ufSigla||'',address:[r.payload?.logradouro,r.payload?.numero,r.payload?.bairro].filter(Boolean).join(', '),latitude:r.latitude,longitude:r.longitude,locationVersion:r.version,lead:false,in_portfolio:false,lastVisit:null,health:'overdue'}));
 if (query !== null) {
   const fold = (value:string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
   return {rows:customers.filter(c=>matchesSearch(fold([c.key,c.name,c.tradeName,c.city,c.uf,c.document].join(' ')), fold(query.trim()))).slice((page-1)*30,(page-1)*30+31).map(c=>({id:c.key,displayId:c.key.slice(3),name:c.name,tradeName:c.tradeName,detail:`${c.city}/${c.uf} · ${c.document}`,data:c}))};
 }
 return {customers};
}
