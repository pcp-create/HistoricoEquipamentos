import {listData,uniqueRows} from '../m8/collections.js';
import {id} from '../m8/ordemServico.js';
import type {M8Client} from '../m8/client.js';
import {transaction,type Database} from '../database/postgres.js';
import {SafeError} from '../utils/logger.js';
export const quoteKinds=['produto','servico','vendedor'] as const;
export function quoteRows(body:unknown){
 return uniqueRows(listData(body)).map(row=>{
  if(typeof row.numeroProposta!=='string'||!row.numeroProposta.trim())throw new SafeError('Orçamento sem número de proposta');
  for(const key of ['dataEmissao','dataValidade'])if(row[key]!=null && !/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(String(row[key])))throw new SafeError('Data de orçamento inválida');
  if(row.total!=null&&(typeof row.total!=='number'||!Number.isFinite(row.total)))throw new SafeError('Total de orçamento inválido');
  return {id:id(row.id),number:row.numeroProposta,revision:row.revisao??0,client:row.clienteNome??row.clienteRazaoSocial,
   document:row.clienteCpfCnpj,client_id:row.clienteId==null?null:String(row.clienteId),city:row.clienteCidade??row.clienteClidade,state:row.clienteUf,
   description:row.descricao,type_name:row.tipoOrcamento,status:row.status,situation:row.statusLancamentoId,
   emission:row.dataEmissao==null?null:String(row.dataEmissao).slice(0,10),validity:row.dataValidade==null?null:String(row.dataValidade).slice(0,10),total:row.total,payload:row};
 });
}
export async function saveQuoteHeaders(db:Database,company:number,body:unknown){
 const rows=quoteRows(body);
 // Missing records never imply deletion. Incomplete/failed collection responses preserve the previous snapshot.
 await db.query(`INSERT INTO public.m8_quotes(company_id,id,number,revision,client,document,client_id,city,state,description,type_name,status,situation,emission,validity,total,payload)
 SELECT $1,id,number,revision,client,document,client_id,city,state,description,type_name,status,situation,emission,validity,total,payload
 FROM jsonb_to_recordset($2::jsonb) AS r(id bigint,number text,revision integer,client text,document text,client_id text,city text,state text,description text,type_name text,status text,situation text,emission date,validity date,total numeric,payload jsonb)
 ON CONFLICT(company_id,id) DO UPDATE SET number=EXCLUDED.number,revision=EXCLUDED.revision,client=EXCLUDED.client,document=EXCLUDED.document,client_id=EXCLUDED.client_id,city=EXCLUDED.city,state=EXCLUDED.state,description=EXCLUDED.description,type_name=EXCLUDED.type_name,status=EXCLUDED.status,situation=EXCLUDED.situation,emission=EXCLUDED.emission,validity=EXCLUDED.validity,total=EXCLUDED.total,
 pending=m8_quotes.pending OR m8_quotes.payload IS DISTINCT FROM EXCLUDED.payload,payload=EXCLUDED.payload,collected_at=now()`,[company,JSON.stringify(rows)]);
 return rows.length;
}
export async function refreshQuoteDetails(db:Database,client:Pick<M8Client,'get'|'company'>,quoteId:string){
 const all:{kind:string;id:string;payload:Record<string,unknown>}[]=[];
 for(const kind of quoteKinds){
  const rows=uniqueRows(listData(await client.get(`/v1/crm/orcamento/${quoteId}/${kind}`,{Page:0,PageSize:0})));
  for(const row of rows){
   if(row.orcamentoId!=null&&id(row.orcamentoId)!==quoteId)throw new SafeError('Item pertence a outro orçamento');
   all.push({kind,id:id(row.id),payload:row});
  }
 }
 await transaction(db,async()=>{
  await db.query('DELETE FROM public.m8_quote_items WHERE company_id=$1 AND quote_id=$2',[client.company,quoteId]);
  await db.query(`INSERT INTO public.m8_quote_items(company_id,quote_id,kind,id,payload) SELECT $1,$2,kind,id,payload FROM jsonb_to_recordset($3::jsonb) AS r(kind text,id bigint,payload jsonb)`,[client.company,quoteId,JSON.stringify(all)]);
  await db.query('UPDATE public.m8_quotes SET detail_at=now(),pending=false,retry_after=NULL,failures=0 WHERE company_id=$1 AND id=$2',[client.company,quoteId]);
 });
}
export async function syncQuotes(client:Pick<M8Client,'get'|'company'>,db:Database,limit=20){
 const acquired=(await db.query<{locked:boolean}>('SELECT pg_try_advisory_lock(81020,$1) locked',[client.company])).rows[0]?.locked;
 if(!acquired)return {skipped:true};
 try{
  const received=await saveQuoteHeaders(db,client.company,await client.get('/v1/crm/orcamento',{Page:0,PageSize:0}));
  const queue=(await db.query<{id:string}>(`SELECT id::text FROM public.m8_quotes WHERE company_id=$1 AND (retry_after IS NULL OR retry_after<=now())
   AND (pending OR detail_at IS NULL OR detail_at<now()-interval '24 hours') ORDER BY pending DESC,detail_at ASC NULLS FIRST,id DESC LIMIT $2`,[client.company,limit])).rows;
  let imported=0,failed=0;
  for(const row of queue){
   try{await refreshQuoteDetails(db,client,row.id);imported++;}
   catch{failed++;await db.query("UPDATE public.m8_quotes SET failures=failures+1,retry_after=now()+interval '5 minutes' WHERE company_id=$1 AND id=$2",[client.company,row.id]);}
  }
  return {received,imported,failed};
 }finally{await db.query('SELECT pg_advisory_unlock(81020,$1)',[client.company]);}
}
