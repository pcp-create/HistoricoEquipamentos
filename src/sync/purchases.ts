import {listData,uniqueRows} from '../m8/collections.js';
import {id} from '../m8/ordemServico.js';
import type {M8Client} from '../m8/client.js';
import {transaction,type Database} from '../database/postgres.js';
import {SafeError} from '../utils/logger.js';
type Client=Pick<M8Client,'get'|'company'>;
const endpoint='/v1/compras/ordemcompra';
const normalize=(v:unknown)=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
export function purchaseHeader(row:Record<string,unknown>){
 // M8 returns numeric 11 with this explicit name, although the Swagger enum omits it.
 const status=row.status===11 && row.statusNome==='ParcialmenteAtendido' ? 'ParcialmenteAtendido' : row.status;
 if(!['Pendente','Aprovado','Processado','Cancelado','ParcialmenteAtendido'].includes(String(status)) || typeof row.ativo!=='boolean')throw new SafeError('Status da ordem de compra inválido');
 return {id:id(row.id),status,eligible:row.ativo && ['Pendente','Aprovado','ParcialmenteAtendido'].includes(String(status)) && row.statusAprovacao!=='Reprovado',supplier:row.fornecedorNome??null,payload:row};
}
export function purchaseItem(row:Record<string,unknown>,orderId:string){
 if(id(row.ordemCompraId)!==orderId)throw new SafeError('Item pertence a outra ordem de compra');
 for(const key of ['quantidade','quantidadeComprada','saldo'])if(typeof row[key]!=='number'||!Number.isFinite(row[key]))throw new SafeError('Quantidade de compra inválida');
 if(typeof row.itemTransferido!=='boolean')throw new SafeError('Indicador de transferência inválido');
 return {id:id(row.id),product_id:row.produtoId==null?null:id(row.produtoId),unit:row.unidadeNome??null,
  quantity:row.quantidade,purchased:row.quantidadeComprada,balance:Math.max(0,Number(row.saldo)),
  eligible:!row.itemTransferido && !['cancelado','cancelada','excluido','excluida'].includes(normalize(row.statusItemNome)),payload:row};
}
/** Explicit documented pagination, with truncation/repeated-page protection. Never persist a partial collection. */
export async function purchasePages(client:Pick<M8Client,'get'>,path:string,params:Record<string,string|number>={}){
 const all:Record<string,unknown>[]=[],seen=new Set<string>();
 for(let page=1;page<=1000;page++){
  const rows=listData(await client.get(path,{...params,Page:page,PageSize:1000}));
  for(const row of rows){const key=id(row.id);if(seen.has(key))throw new SafeError('Paginação de compras repetiu registros; coleta descartada');seen.add(key);all.push(row);}
  if(rows.length<1000)return all;
 }
 throw new SafeError('Limite de paginação de compras excedido');
}
export async function savePurchaseHeaders(db:Database,company:number,rows:Record<string,unknown>[]){
 const headers=uniqueRows(rows).map(purchaseHeader);
 await db.query(`INSERT INTO public.m8_purchase_orders(company_id,id,status,eligible,supplier,payload)
 SELECT $1,id,status,eligible,supplier,payload FROM jsonb_to_recordset($2::jsonb) AS r(id bigint,status text,eligible boolean,supplier text,payload jsonb)
 ON CONFLICT(company_id,id) DO UPDATE SET status=EXCLUDED.status,eligible=EXCLUDED.eligible,supplier=EXCLUDED.supplier,
 pending=m8_purchase_orders.pending OR NOT m8_purchase_orders.present OR m8_purchase_orders.payload IS DISTINCT FROM EXCLUDED.payload,
 payload=EXCLUDED.payload,present=true,collected_at=now()`,[company,JSON.stringify(headers)]);
 return headers.length;
}
export async function refreshPurchase(db:Database,client:Client,orderId:string){
 const headers=await purchasePages(client,endpoint,{Id:orderId});
 if(!headers.length){await db.query('UPDATE public.m8_purchase_orders SET present=false,pending=false,detail_at=now(),retry_after=NULL WHERE company_id=$1 AND id=$2',[client.company,orderId]);return;}
 if(headers.length!==1||id(headers[0]!.id)!==orderId)throw new SafeError('Consulta de compra por ID não corresponde à ordem');
 purchaseHeader(headers[0]!);
 const items=(await purchasePages(client,`${endpoint}/${orderId}/item`)).map(r=>purchaseItem(r,orderId));
 const latest=await purchasePages(client,endpoint,{Id:orderId});
 if(JSON.stringify(latest)!==JSON.stringify(headers))throw new SafeError('Ordem de compra mudou durante a coleta; tentar novamente');
 await transaction(db,async()=>{
  await savePurchaseHeaders(db,client.company,headers);
  await db.query('DELETE FROM public.m8_purchase_items WHERE company_id=$1 AND order_id=$2',[client.company,orderId]);
  await db.query(`INSERT INTO public.m8_purchase_items(company_id,order_id,id,product_id,unit,quantity,purchased,balance,eligible,payload)
   SELECT $1,$2,id,product_id,unit,quantity,purchased,balance,eligible,payload FROM jsonb_to_recordset($3::jsonb)
   AS r(id bigint,product_id bigint,unit text,quantity numeric,purchased numeric,balance numeric,eligible boolean,payload jsonb)`,[client.company,orderId,JSON.stringify(items)]);
  await db.query('UPDATE public.m8_purchase_orders SET pending=false,detail_at=now(),retry_after=NULL,failures=0 WHERE company_id=$1 AND id=$2',[client.company,orderId]);
 });
}
export async function syncPurchases(client:Client,db:Database,limit=20){
 const locked=(await db.query<{locked:boolean}>('SELECT pg_try_advisory_lock(81021,$1) locked',[client.company])).rows[0]?.locked;
 if(!locked)return {skipped:true};
 try{
  const rows=await purchasePages(client,endpoint);
  const received=await transaction(db,async()=>{
   const count=await savePurchaseHeaders(db,client.company,rows);
   await db.query('INSERT INTO public.m8_purchase_sync(company_id,headers_at) VALUES($1,now()) ON CONFLICT(company_id) DO UPDATE SET headers_at=now()',[client.company]);
   return count;
  });
  const queue=(await db.query<{id:string}>(`WITH queue AS (SELECT *,row_number() OVER(PARTITION BY (eligible AND present) ORDER BY pending DESC,detail_at ASC NULLS FIRST,id DESC) AS rank FROM public.m8_purchase_orders WHERE company_id=$1 AND (retry_after IS NULL OR retry_after<=now())
   AND (pending OR detail_at IS NULL OR detail_at<now()-CASE WHEN eligible AND present THEN interval '1 minute' ELSE interval '24 hours' END))
   SELECT id::text FROM queue ORDER BY CASE WHEN eligible AND present AND rank<=greatest(1,ceil($2::numeric*0.75)) THEN 0 ELSE 1 END,
   (detail_at IS NULL) DESC,pending DESC,detail_at ASC NULLS FIRST,id DESC LIMIT $2`,[client.company,limit])).rows;
  let imported=0,failed=0;
  for(const row of queue){try{await refreshPurchase(db,client,row.id);imported++;}catch{failed++;await db.query("UPDATE public.m8_purchase_orders SET pending=true,failures=failures+1,retry_after=now()+interval '5 minutes' WHERE company_id=$1 AND id=$2",[client.company,row.id]);}}
  return {received,imported,failed};
 }finally{await db.query('SELECT pg_advisory_unlock(81021,$1)',[client.company]);}
}
