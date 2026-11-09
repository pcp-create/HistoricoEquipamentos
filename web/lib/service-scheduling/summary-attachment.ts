import 'server-only';
import {createHash} from 'node:crypto';
import {database} from '../db';
import {Forbidden} from '../auth';
import {OrderInputError} from '../service-orders/model';
import {attachmentMaxBytes,uploadOrderAttachment} from '../service-orders/attachments';
import {loadOrderReport} from './order-report-store';
import {renderChecklistPdf} from './checklist-pdf';

export async function attachSummaryReport(input:any,actor:string){
 if(typeof input?.scheduleId!=='string'||!/^\d{1,18}$/.test(input.scheduleId))throw new OrderInputError('Programação inválida.');
 const c=await database().connect();
 let schedule:any,model:any,photos:any[]=[];
 try{
  await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  if(!(await c.query('SELECT 1 FROM web_user_access WHERE email=$1 AND enabled',[actor])).rows.length)throw new Forbidden();
  schedule=(await c.query('SELECT company_id,order_id FROM web_service_schedules WHERE id=$1 AND active',[input.scheduleId])).rows[0];
  if(!schedule)throw new OrderInputError('Programação indisponível.');
  const ops=(await c.query('SELECT id,status,document FROM web_service_operations WHERE schedule_id=$1 ORDER BY position,id',[input.scheduleId])).rows;
  if(!ops.length||ops.some(op=>!['reviewed','completed'].includes(op.status)))throw new OrderInputError('Conclua a revisão de todas as operações ou desmarque o anexo automático.');
  const operationIds=ops.filter(op=>op.document.checklistRun).map(op=>op.id);
  if(!operationIds.length)throw new OrderInputError('Esta OS não possui relatório técnico para anexar.');
  ({model,photos}=await loadOrderReport({scheduleId:input.scheduleId,operationIds,mode:'summary',includeTimeline:false},actor,false,c));
  await c.query('COMMIT');
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 // Content identity ignores volatile PDF metadata. Retries keep the ERP upload reservation.
 const hash=createHash('sha256').update(JSON.stringify(model));
 for(const photo of [...photos].sort((a,b)=>String(a.id).localeCompare(String(b.id))))hash.update(String(photo.id)).update(photo.content);
 const identity=hash.digest('hex');
 const filename=model.summaryFilename.replace(/\.pdf$/i,'').slice(0,176).trim()+'.pdf';
 let bytes:Uint8Array=new Uint8Array();
 for(const budget of [2_000_000,700_000]){
  bytes=await renderChecklistPdf({...model,client:'',equipment:'',photos},budget);
  if(bytes.length<=attachmentMaxBytes)break;
 }
 if(bytes.length>attachmentMaxBytes)throw new OrderInputError('O relatório resumido excede os 3 MB aceitos pelo ERP. Desmarque o anexo automático e confira as imagens do relatório.');
 const result=await uploadOrderAttachment(String(schedule.company_id),String(schedule.order_id),filename,Buffer.from(bytes),actor,identity);
 return {...result,filename};
}
