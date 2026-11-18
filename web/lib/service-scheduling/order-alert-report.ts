import 'server-only';
import type {PoolClient} from 'pg';
import {orderReport} from './order-report';
import {renderTaskChecklistPdf} from './checklist-pdf';
import {reportFilenameMode,type ReportMode} from './checklist-report';

/** Internal to final OS review: the caller owns the schedule lock and validates every operation. */
export async function loadOrderAlertReport(c:PoolClient,schedule:any,operations:any[],settings:any,mode:ReportMode){
 const order=(await c.query('SELECT * FROM m8_ordens_servico WHERE company_id=$1 AND id_m8=$2',[schedule.company_id,schedule.order_id])).rows[0];
 if(!order)throw Error('OS não encontrada para anexar o relatório à tarefa.');
 const included=operations.filter(o=>o.document?.checklistRun);
 if(!included.length)throw Error('A OS não possui relatório técnico para anexar.');
 const ids=included.map(o=>o.id);
 const users=(await c.query('SELECT email,display_name FROM web_user_access')).rows;
 const sessions=(await c.query('SELECT f.*,u.display_name FROM web_field_sessions f LEFT JOIN web_user_access u ON u.email=f.actor WHERE f.operation_id=ANY($1::uuid[])',[ids])).rows;
 const events=(await c.query("SELECT * FROM web_field_events WHERE operation_id=ANY($1::uuid[]) AND action IN ('start_work','start_travel','pause','resume','stop') ORDER BY created_at,id",[ids])).rows;
 const history=(await c.query('SELECT e.*,u.display_name FROM web_service_operation_events e LEFT JOIN web_user_access u ON u.email=e.actor WHERE e.operation_id=ANY($1::uuid[])',[ids])).rows;
 const model=orderReport({schedule,detail:{order},operations:included,users,settings:{document:settings},fieldSessions:sessions,fieldEvents:events,events:history},ids,mode);
 const photos:any[]=[];
 for(const chapter of model.chapters){
  const fields=chapter.report.flatMap(s=>s.groups.flatMap(g=>g.fields));
  const photoIds=[...new Set(fields.flatMap(f=>f.photos))];
  if(!photoIds.length)continue;
  const own=(await c.query('SELECT id::text,content FROM web_service_checklist_photos WHERE operation_id=$1 AND id=ANY($2::bigint[])',[chapter.id,photoIds])).rows;
  if(own.length!==photoIds.length)throw Error('Há fotos indisponíveis em uma operação. Confira os anexos antes de concluir a revisão da OS.');
  // Keep photo ownership explicit when different operations are rendered together.
  photos.push(...own.map(photo=>({...photo,id:chapter.id+':'+photo.id})));
  for(const field of fields)field.photos=field.photos.map(id=>chapter.id+':'+id);
 }
 return {model,photos};
}
export async function orderAlertReportPdf(c:PoolClient,schedule:any,operations:any[],settings:any,mode:ReportMode){
 const {model,photos}=await loadOrderAlertReport(c,schedule,operations,settings,mode);
 const bytes=await renderTaskChecklistPdf({...model,client:'',equipment:'',photos},'O relatório agrupado excede o limite de 5 MB do anexo mesmo após otimização. Escolha o formato Resumido ou Orçamento ou revise as fotos. A revisão da OS não foi concluída.');
 return {bytes,filename:`Relatorio-OS-${model.order.replace(/[^\w-]/g,'')}-unificado-${reportFilenameMode[mode]}.pdf`};
}
