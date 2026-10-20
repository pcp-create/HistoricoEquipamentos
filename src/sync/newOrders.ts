import {schemas} from '../database/schema.js';
import {mapEntity} from '../database/ordensServico.repository.js';
import {transaction,type Database} from '../database/postgres.js';
import type {HeaderSnapshot} from '../m8/collections.js';

// Insert only: the fast discovery job must never overwrite a full-cycle snapshot.
export async function insertNewOrders(db:Database,company:number,headers:HeaderSnapshot[],timeZone:string){
 const known=new Set((await db.query<{id:string}>('SELECT id_m8::text AS id FROM m8_ordens_servico WHERE company_id=$1',[company])).rows.map(row=>row.id));
 const fresh=headers.filter(row=>!known.has(String(row.header.id)));
 let inserted=0;
 for(const snapshot of fresh){
  await transaction(db,async()=>{
   const mapped=mapEntity(schemas[0],snapshot.header,company,undefined,timeZone);
   const columns=Object.keys(mapped);
   const result=await db.query<{id_m8:string}>(`INSERT INTO m8_ordens_servico (${columns.join(',')}) VALUES (${columns.map((_,i)=>'$'+(i+1)).join(',')}) ON CONFLICT(company_id,id_m8) DO NOTHING RETURNING id_m8`,Object.values(mapped));
   if(!result.rows.length)return;
   const id=result.rows[0]!.id_m8;
   await db.query("INSERT INTO integracao_m8_os_sync(company_id,ordem_servico_id,summary_status,inventory_seen_at,pending,finalized) VALUES($1,$2,$3,now(),true,false) ON CONFLICT(company_id,ordem_servico_id) DO NOTHING",[company,id,snapshot.header.status]);
   for(const documentId of snapshot.fiscalDocumentIds)await db.query("INSERT INTO m8_os_documentos_fiscais(company_id,ordem_servico_id,documento_fiscal_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",[company,id,documentId]);
   inserted++;
  });
 }
 return inserted;
}
