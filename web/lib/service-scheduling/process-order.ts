import 'server-only';
import {database} from '../db';
import {Forbidden} from '../auth';
import {m8Session,M8RequestError} from '../service-orders/m8';
import {writable} from '../service-orders/edit';
import {OrderInputError} from '../service-orders/model';

import {processOrderBlockReason} from './process-order-policy';
const result=(row:any)=>({id:row.id,state:row.state,nextStep:row.next_step,message:row.message});
async function gate(c:any,scheduleId:string,email:string){
 if(!(await c.query('SELECT 1 FROM web_user_access WHERE email=$1 AND enabled',[email])).rows.length)throw new Forbidden();
 const schedule=(await c.query('SELECT * FROM web_service_schedules WHERE id=$1 AND active FOR UPDATE',[scheduleId])).rows[0];
 if(!schedule)throw new OrderInputError('Programação indisponível.');
 const operations=(await c.query('SELECT status FROM web_service_operations WHERE schedule_id=$1 FOR UPDATE',[scheduleId])).rows;
 const reason=processOrderBlockReason(operations);if(reason)throw new OrderInputError(reason);
 return schedule;
}
/** One persisted ERP write per request. The sending reservation survives a crash. */
export async function processScheduleOrder(scheduleId:string,id:string,email:string,session=m8Session){
 if(!/^[1-9]\d{0,17}$/.test(scheduleId)||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))throw new OrderInputError('Identificador inválido.');
 const db=database(),c=await db.connect();let row:any,schedule:any;
 try{
  await c.query('BEGIN READ WRITE');schedule=await gate(c,scheduleId,email);
  await c.query('SELECT pg_advisory_xact_lock($1,$2)',[Number(schedule.company_id),Number(schedule.order_id)]);
  row=(await c.query('SELECT * FROM service_order_edits WHERE id=$1 FOR UPDATE',[id])).rows[0];
  if(row&&(row.created_by!==email||String(row.company_id)!==String(schedule.company_id)||String(row.m8_id)!==String(schedule.order_id)||row.request?.purpose!=='process-schedule'||row.request?.scheduleId!==scheduleId))throw new OrderInputError('Este envio pertence a outra solicitação.');
  if(!row){
   const active=(await c.query("SELECT * FROM service_order_edits WHERE company_id=$1 AND m8_id=$2 AND state IN('ready','sending','partial','uncertain') FOR UPDATE",[schedule.company_id,schedule.order_id])).rows[0];
   if(active){
    if(active.created_by===email&&active.request?.purpose==='process-schedule'&&active.request?.scheduleId===scheduleId)row=active;
    else throw new OrderInputError('Esta OS possui uma edição em andamento. Conclua ou confira o envio antes de processar.');
   }else{
    const base=`/v1/assistenciatecnica/ordemservico/${schedule.order_id}`;
    row=(await c.query("INSERT INTO service_order_edits(id,company_id,m8_id,created_by,source_hash,request,steps,state) VALUES($1,$2,$3,$4,'process-schedule',$5,$6,'ready') RETURNING *",[id,schedule.company_id,schedule.order_id,email,JSON.stringify({purpose:'process-schedule',scheduleId}),JSON.stringify([{path:base+'/statusfluxo',method:'PATCH',payload:{statusFluxoId:19}},{path:base,method:'PUT'}])])).rows[0];
   }
  }
  if(['sending','complete'].includes(row.state)){await c.query('COMMIT');return result(row);}
  // An ambiguous write can only be reconciled by reading, never blindly replayed.
  const reconcile=row.state==='uncertain';
  await c.query("UPDATE service_order_edits SET state='sending',message=NULL,updated_at=now() WHERE id=$1",[row.id]);
  await c.query('COMMIT');
  let next=row.next_step,state='uncertain',message:string|null=null,writeStarted=false;
  try{
   const m8=await session(Number(schedule.company_id));
   await c.query('BEGIN READ WRITE');await gate(c,scheduleId,email);
   const read=async()=>{
    const rows=await m8(`/v1/assistenciatecnica/ordemservicocompleta?Id=${schedule.order_id}&Page=1&PageSize=1`);
    if(!Array.isArray(rows)||rows.length!==1||String(rows[0].id)!==String(schedule.order_id))throw new OrderInputError('OS não encontrada no M8.');
    return rows[0];
   };
   const source=await read();
   const finished=(s:any)=>['Processado','Processada'].includes(s.status)&&Number(s.statusLancamentoId)===19;
   if(finished(source)){next=2;state='complete';}
   else if(reconcile){
    if(next===0&&Number(source.statusLancamentoId)===19){next=1;state='ready';}
    else{state='uncertain';message='O M8 não confirmou o processamento. Confira a OS no ERP antes de qualquer novo envio.';}
   }else{
    if(!['Pendente','Aprovado'].includes(source.status))throw new OrderInputError('Somente uma OS pendente ou aprovada pode ser processada. Confira o status no M8.');
    const step={...row.steps[next]};
    if(next===1){
     if(Number(source.statusLancamentoId)!==19)throw new OrderInputError('O fluxo da OS mudou no M8. Confira o fluxo antes de processar.');
     step.payload={...writable(source,'ATOrdemServicoRequestDto'),status:'Processado'};
     for(const key of ['apontamentos','produtos','servicos','parcelas','checklistRespostas','manutencao'])delete step.payload[key];
     row.steps[next]=step;
     await c.query('UPDATE service_order_edits SET steps=$2 WHERE id=$1',[row.id,JSON.stringify(row.steps)]);
    }
    if(next!==0||Number(source.statusLancamentoId)!==19){
     writeStarted=true;const saved=await m8(step.path,step.payload,step.method);
     if(step.method==='PUT'&&String(saved?.id)!==String(schedule.order_id))throw new M8RequestError('O M8 não confirmou o ID da OS processada. Confira no ERP.',true);
    }
    next++;state=next===2?'complete':'ready';
    if(state==='complete'&&!finished(await read()))throw new M8RequestError('O M8 ainda não confirmou o status Processado e o fluxo OS Faturada. Confira no ERP.',true);
   }
   if(state==='complete'){
    await c.query("UPDATE m8_ordens_servico SET status='Processado',status_lancamento_id=19,status_lancamento_nome='OS Faturada',payload=payload||$3::jsonb WHERE company_id=$1 AND id_m8=$2",[schedule.company_id,schedule.order_id,JSON.stringify({status:'Processado',statusLancamentoId:19,statusLancamentoNome:'OS Faturada'})]);
    await c.query("INSERT INTO web_access_events(event,email,actor,details) VALUES('service_order_processed',$1,$1,$2)",[email,JSON.stringify({scheduleId,company:schedule.company_id,orderId:schedule.order_id,requestId:row.id})]);
   }
   await c.query('COMMIT');
  }catch(e){
   await c.query('ROLLBACK');
   state=writeStarted&&(!(e instanceof M8RequestError)||e.uncertain)?'uncertain':next?'partial':'rejected';
   message=e instanceof Error?e.message:'Não foi possível confirmar o processamento.';
  }
  await c.query('BEGIN READ WRITE');
  row=(await c.query('UPDATE service_order_edits SET state=$2,next_step=$3,message=$4,updated_at=now() WHERE id=$1 RETURNING *',[row.id,state,next,message])).rows[0];
  await c.query('COMMIT');return result(row);
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
