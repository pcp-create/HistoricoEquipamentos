import type {Database} from '../database/postgres.js';
import {transaction} from '../database/postgres.js';
import type {M8Client} from '../m8/client.js';
import {listData,summaryHeaders,type HeaderSnapshot} from '../m8/collections.js';
import {SUMMARY_ENDPOINT} from '../m8/inventory.js';
import {SafeError,log,safeError} from '../utils/logger.js';

// Only an explicit not-found response is evidence. Network, permission and server
// errors must never turn a local order into a deleted one.
export async function reconcileDeletedOrders(db:Database,client:Pick<M8Client,'company'|'get'>,headers:HeaderSnapshot[],startedAt:Date){
 if(!headers.length)throw new SafeError('Inventário vazio: reconciliação de exclusões suspensa');
 const present=headers.map(s=>String(s.header.id));
 const candidates=await db.query<{id_m8:string}>(`SELECT id_m8::text FROM m8_ordens_servico WHERE company_id=$1
  AND NOT(id_m8=ANY($2::bigint[])) AND status IS DISTINCT FROM 'Excluida' AND updated_at<=$3`,[client.company,present,startedAt]);
 let deleted=0,unconfirmed=0;
 for(const row of candidates.rows){
  let missing=false,reason='';
  try{
   const body=await client.get(SUMMARY_ENDPOINT,{Id:row.id_m8,Page:1,PageSize:100});
   const data=listData(body);
   if(data.length===0){missing=true;reason='Consulta individual sem registros';}
   else {const matches=summaryHeaders(body);if(matches.length!==1||String(matches[0]!.header.id)!==row.id_m8)throw new SafeError('Consulta individual divergente');}
  }catch(error){
   if(error instanceof SafeError&&[404,410].includes(error.status??0)){missing=true;reason=`HTTP ${error.status}`;}
   else {unconfirmed++;log('EXCLUSAO_OS',safeError(error),{company:client.company,orderId:row.id_m8});}
  }
  if(!missing)continue;
  await transaction(db,async()=>{
   const changed=await db.query(`UPDATE m8_ordens_servico SET status='Excluida',
    payload=payload||jsonb_build_object('status','Excluida','_m8Deletion',jsonb_build_object('confirmedAt',now(),'inventoryAt',$3::timestamptz,'reason',$4::text,'previousStatus',status)),
    updated_at=now(),sincronizado_em=now() WHERE company_id=$1 AND id_m8=$2 AND status IS DISTINCT FROM 'Excluida' AND updated_at<=$3 RETURNING id_m8`,[client.company,row.id_m8,startedAt,reason]);
   if(changed.rows.length){
    await db.query(`UPDATE integracao_m8_os_sync SET pending=false,finalized=true,summary_status='Excluida',error=NULL WHERE company_id=$1 AND ordem_servico_id=$2`,[client.company,row.id_m8]);deleted++;
   }
  });
 }
 log('EXCLUSAO_OS','Reconciliação concluída',{company:client.company,candidates:candidates.rows.length,deleted,unconfirmed});
 return {deleted,unconfirmed};
}
