import 'server-only';
import {emailRecipients,reportAttachmentName} from './email-recipients';
import {randomUUID} from 'node:crypto';
import {database} from '../db';
import {Forbidden} from '../auth';
import {orderReportPdf} from './order-report-store';
export class CustomerEmailError extends Error {}
export function emailMessage({to,subject,body,filename,pdf}:{to:string;subject:string;body:string;filename:string;pdf:Uint8Array}){
 try{to=emailRecipients(to).join(',\r\n ');filename=reportAttachmentName(filename);}catch(e){throw new CustomerEmailError((e as Error).message);}
 if(!subject.trim()||subject.length>300||/[\r\n]/.test(subject))throw new CustomerEmailError('Informe um assunto válido.');
 if(!body.trim()||body.length>10000)throw new CustomerEmailError('Informe o texto do e-mail (até 10.000 caracteres).');
 const boundary='rj_'+randomUUID(),base64=(value:Uint8Array|string)=>Buffer.from(value as any).toString('base64').match(/.{1,76}/g)?.join('\r\n')||'';
 const encodedSubject=Array.from(subject).reduce((parts:string[],letter)=>{if(!parts.length||Buffer.byteLength(parts.at(-1)!+letter)>42)parts.push(letter);else parts[parts.length-1]+=letter;return parts;},[]).map(part=>'=?UTF-8?B?'+Buffer.from(part).toString('base64')+'?=').join('\r\n ');
 const encodedName=encodeURIComponent(filename).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
 const nameParts=(encodedName.match(/%[0-9A-F]{2}|./g)||[]).reduce((parts:string[],token)=>{if(!parts.length||parts.at(-1)!.length+token.length>48)parts.push(token);else parts[parts.length-1]+=token;return parts;},[]);
 const fallback=filename.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^\x20-\x7e]|["\\]/g,'_');
 const disposition='Content-Disposition: attachment; filename="'+fallback+'";\r\n'+nameParts.map((part,i)=>' filename*'+i+'*='+(i===0?"UTF-8''":'')+part).join(';\r\n');
 return ['X-Unsent: 1','To: '+to,'Subject: '+encodedSubject,'MIME-Version: 1.0','Content-Type: multipart/mixed; boundary="'+boundary+'"','','--'+boundary,'Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',base64(body),'--'+boundary,'Content-Type: application/pdf',disposition,'Content-Transfer-Encoding: base64','',base64(pdf),'--'+boundary+'--',''].join('\r\n');
}
export async function prepareCustomerEmail(input:any,actor:string){
 if(!/^\d{1,18}$/.test(input?.scheduleId||''))throw new CustomerEmailError('Programação inválida.');
 if(typeof input.to!=='string'||typeof input.subject!=='string'||typeof input.body!=='string')throw new CustomerEmailError('Confira os dados do e-mail.');
 // Validate headers before generating a potentially large report.
 emailMessage({...input,filename:'relatorio.pdf',pdf:new Uint8Array()});
 const c=await database().connect();
 try{
  await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  if(!(await c.query('SELECT 1 FROM web_user_access WHERE email=$1 AND enabled',[actor])).rows.length)throw new Forbidden();
  const schedule=(await c.query('SELECT id FROM web_service_schedules WHERE id=$1 AND active',[input.scheduleId])).rows[0];
  if(!schedule)throw new CustomerEmailError('Programação indisponível.');
  const ops=(await c.query('SELECT id,status,document FROM web_service_operations WHERE schedule_id=$1 ORDER BY position',[input.scheduleId])).rows;
  if(!ops.length||ops.some(op=>!['reviewed','completed'].includes(op.status)))throw new CustomerEmailError('Conclua a revisão de todas as operações antes de preparar o e-mail.');
  const selected=ops.filter(op=>op.document.checklistRun).map(op=>op.id);
  if(!selected.length)throw new CustomerEmailError('A OS não possui relatório técnico para enviar.');
  if(input.reportFilename!==undefined){try{reportAttachmentName(input.reportFilename);}catch(e){throw new CustomerEmailError((e as Error).message);}}
  const pdf=await orderReportPdf({scheduleId:input.scheduleId,operationIds:selected,mode:'summary',includeTimeline:false},actor,false,c);
  if(input.reportFilename)pdf.filename=reportAttachmentName(input.reportFilename);
  await c.query('COMMIT');
  return {raw:Buffer.from(emailMessage({...input,filename:pdf.filename,pdf:pdf.bytes})).toString('base64url'),filename:pdf.filename.replace(/\.pdf$/i,'.eml'),reportFilename:pdf.filename};
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
