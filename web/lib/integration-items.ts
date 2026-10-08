import "server-only";
import {database} from "./db";
import {AdminInputError} from "./admin-store";
const sources = {
 orders: `SELECT o.company_id,o.id_m8::text AS id,COALESCE(o.numero_sequencia,o.id_m8)::text AS code,o.cliente_nome AS name,o.status AS detail,GREATEST(o.updated_at,s.last_detail_at) AS updated_at FROM m8_ordens_servico o LEFT JOIN integracao_m8_os_sync s ON s.company_id=o.company_id AND s.ordem_servico_id=o.id_m8`,
 equipment: `SELECT company_id,equipment_id::text AS id,equipment_id::text AS code,name,concat_ws(' · ',brand,model,serial) AS detail,collected_at AS updated_at FROM m8_equipment_catalog`,
 products: `SELECT company_id,product_id::text AS id,product_id::text AS code,name,unit AS detail,collected_at AS updated_at FROM m8_product_catalog`,
 customers: `SELECT company_id,person_id::text AS id,person_id::text AS code,name,document AS detail,collected_at AS updated_at FROM m8_customer_directory WHERE company_id=1`,
};
export async function integrationItems(params:URLSearchParams) {
 const kind=params.get('integration') || '';
 if (!Object.hasOwn(sources,kind)) throw new AdminInputError('Integração inválida.');
 const page=Number(params.get('page') || 1);
 if(!Number.isSafeInteger(page)||page<1||page>100000) throw new AdminInputError('Página inválida.');
 const query=(params.get('q') || '').trim();
 if(query.length>200) throw new AdminInputError('Use até 200 caracteres na pesquisa.');
 const terms=query.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().split(/\s+/).filter(Boolean);
 const rows=(await database().query(`SELECT * FROM (${sources[kind as keyof typeof sources]}) items WHERE NOT EXISTS (
 SELECT 1 FROM unnest($2::text[]) term
 WHERE strpos(translate(lower(concat_ws(' ',id,code,name,detail)),
 'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc'),term)=0
 ) ORDER BY updated_at DESC NULLS LAST,id::bigint DESC,company_id LIMIT 51 OFFSET $1`,[(page-1)*50,terms])).rows;
 return {rows:rows.slice(0,50),hasNext:rows.length>50,page};
}
