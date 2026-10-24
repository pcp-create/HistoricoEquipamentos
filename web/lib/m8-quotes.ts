import {searchWords} from "@/lib/filters";
import "server-only";
import {database} from "./db";
import {escapeLike,fold} from "./filters";
export class QuoteFilterError extends Error{}
export function quoteFilters(params:URLSearchParams){
 const view=params.get("view")||"quotes";if(!["quotes","materials"].includes(view))throw new QuoteFilterError("Visão inválida.");
 const values:unknown[]=[];const bind=(v:unknown)=>{values.push(v);return '$'+values.length;};
 const clauses=['q.company_id IN (1,2,27404)'];
 const text=(key:string)=>{const v=(params.get(key)||'').trim();if(v.length>200)throw new QuoteFilterError('Filtro muito longo.');return v;};
 const normalized=(s:string)=>`translate(lower(COALESCE(${s},'')),'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc')`;
 const like=(column:string,v:string)=>"("+searchWords(v).map(term=>`${normalized(column)} LIKE ${bind("%"+escapeLike(fold(term))+"%")}`).join(" AND ")+")";
 const company=text('company');if(company){if(!['1','2','27404'].includes(company))throw new QuoteFilterError('Empresa inválida.');clauses.push('q.company_id='+bind(Number(company)));}
 for(const [key,column] of [['number','q.number'],['client',"concat_ws(' ',q.client,q.document,q.client_id)"],['description','q.description']] as const){const v=text(key);if(v)clauses.push(like(column,v));}
 for(const [key,column] of [['status','q.status'],['type','q.type_name'],['situation','q.situation']] as const){const v=text(key);if(v)clauses.push(column+'='+bind(v));}
 for(const [key,op] of [['from','>='],['to','<=']] as const){const v=text(key);if(v){if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||isNaN(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v)throw new QuoteFilterError('Data inválida.');clauses.push('q.emission'+op+bind(v)+'::date');}}
 if(text('from')&&text('to')&&text('from')>text('to'))throw new QuoteFilterError('A data inicial deve ser anterior à final.');
 for(const [key,kind] of [['product','produto'],['seller','vendedor']] as const){const v=text(key);if(v)clauses.push(key==='product'&&view==='materials'?like("p.payload::text",v):`EXISTS(SELECT 1 FROM m8_quote_items i WHERE i.company_id=q.company_id AND i.quote_id=q.id AND i.kind='${kind}' AND ${like("i.payload::text",v)})`);}
 for(const term of text('q').split(/\s+/).filter(Boolean))clauses.push('('+like("concat_ws(' ',q.number,q.description,q.client,q.document,q.type_name,q.id)",term)+` OR EXISTS(SELECT 1 FROM m8_quote_items i WHERE i.company_id=q.company_id AND i.quote_id=q.id AND ${view==='materials'?"(i.kind='vendedor' OR (i.kind='produto' AND i.id=p.id)) AND ":''}${like('i.payload::text',term)}))`);
 const rawPage=params.get('page')||'1';if(!/^\d{1,7}$/.test(rawPage)||Number(rawPage)<1)throw new QuoteFilterError('Página inválida.');
 const size=Number(params.get('size')||50);if(![25,50,100].includes(size))throw new QuoteFilterError('Quantidade inválida.');
 return {sql:clauses.join(' AND '),values,page:Number(rawPage),size,view};
}
export async function quoteHistory(params:URLSearchParams,exporting=false){
 const f=quoteFilters(params),db=database();
 const from="FROM m8_quotes q "+(f.view==="materials"?"JOIN m8_quote_items p ON p.company_id=q.company_id AND p.quote_id=q.id AND p.kind='produto'":"");
 const total=(await db.query(`SELECT count(*)::int total ${from} WHERE ${f.sql}`,f.values)).rows[0].total;
 if(exporting&&total>10000)throw new QuoteFilterError('Refine os filtros para exportar até 10.000 registros.');
 const page=Math.min(f.page,Math.max(1,Math.ceil(total/f.size)));
 const rows=(await db.query(`SELECT q.company_id,q.id::text,q.number,q.revision,q.client,q.document,q.city,q.state,q.description,q.type_name,q.status,q.situation,q.emission::text,q.validity::text,q.total::text,q.detail_at,q.pending,
 (SELECT count(*)::int FROM m8_quote_items i WHERE i.company_id=q.company_id AND i.quote_id=q.id AND i.kind='produto') products
 ${f.view==='materials'?`,p.id::text item_id,p.payload->>'produtoId' product_id,COALESCE(p.payload->>'produtoNome',p.payload->>'descricao') material,p.payload->>'referenciaFabricante' reference,p.payload->>'quantidade' quantity,p.payload->>'unidadeNome' unit,p.payload->>'valorUnitario' unit_price,p.payload->>'valorTotal' material_total`:''}
 ${from} WHERE ${f.sql} ORDER BY q.emission DESC NULLS LAST,q.id DESC,q.company_id${f.view==='materials'?',p.id':''} LIMIT $${f.values.length+1} OFFSET $${f.values.length+2}`,[...f.values,exporting?10000:f.size,exporting?0:(page-1)*f.size])).rows;
 return {rows,total,page,size:f.size};
}
export async function quoteOverview(){
 const db=database();const stats=(await db.query(`SELECT count(*)::int quotes,count(DISTINCT client_id)::int clients,count(*) FILTER(WHERE detail_at IS NOT NULL)::int detailed,max(collected_at) updated FROM m8_quotes WHERE company_id IN(1,2,27404)`)).rows[0];
 const filters=(await db.query('SELECT DISTINCT status,type_name,situation FROM m8_quotes WHERE company_id IN(1,2,27404)')).rows;
 const choices=(key:string)=>[...new Set(filters.map(r=>r[key]).filter(Boolean))].sort();
 return {...stats,statuses:choices('status'),types:choices('type_name'),situations:choices('situation')};
}
export async function quoteDetail(company:string,id:string){
 if(!['1','2','27404'].includes(company)||!/^\d{1,18}$/.test(id))throw new QuoteFilterError('Orçamento inválido.');
 const db=database();const header=(await db.query('SELECT payload,detail_at,pending,collected_at FROM m8_quotes WHERE company_id=$1 AND id=$2',[company,id])).rows[0];
 if(!header)return null;
 const items=(await db.query('SELECT kind,payload FROM m8_quote_items WHERE company_id=$1 AND quote_id=$2 ORDER BY kind,id',[company,id])).rows;
 return {...header,products:items.filter(i=>i.kind==='produto').map(i=>i.payload),services:items.filter(i=>i.kind==='servico').map(i=>i.payload),sellers:items.filter(i=>i.kind==='vendedor').map(i=>i.payload)};
}
