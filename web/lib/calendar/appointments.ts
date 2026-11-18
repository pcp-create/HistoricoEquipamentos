import 'server-only';
import {database} from '../db';
import {Forbidden} from '../auth';
import {CalendarInputError} from './store';
export const appointmentKinds={personal:'Compromisso pessoal',leave:'Folga',vacation:'Férias',other:'Outro'};
export async function saveAppointment(email:string,body:any,db:any=database()){
 email=email.toLowerCase();
 if(!body||typeof body.id!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.id))throw new CalendarInputError('Compromisso inválido.');
 const c=await db.connect();
 try{
  await c.query('BEGIN READ WRITE');
  const user=(await c.query('SELECT enabled,role FROM web_user_access WHERE email=$1',[email])).rows[0];
  if(!user?.enabled)throw new Forbidden();
  const old=(await c.query('SELECT * FROM web_calendar_appointments WHERE id=$1 FOR UPDATE',[body.id])).rows[0];
  if(old&&old.owner!==email&&user.role!=='admin')throw new Forbidden();
  if(old&&(old.version!==body.version||old.cancelled_at))throw new CalendarInputError('O compromisso foi alterado. Atualize o calendário.');
  if(body.action==='cancel'){
   if(!old)throw new CalendarInputError('Compromisso não encontrado.');
   await c.query('UPDATE web_calendar_appointments SET cancelled_at=now(),updated_at=now(),version=version+1 WHERE id=$1',[body.id]);
  }else{
   if(body.action!=='save')throw new CalendarInputError('Ação inválida.');
   const owner=typeof body.owner==='string'?body.owner.toLowerCase():email;
   if(owner!==email&&user.role!=='admin')throw new Forbidden();
   if(!(await c.query('SELECT 1 FROM web_user_access WHERE email=$1 AND enabled',[owner])).rows.length)throw new CalendarInputError('Funcionário inválido.');
   if(typeof body.title!=='string'||!body.title.trim()||body.title.trim().length>200||!Object.hasOwn(appointmentKinds,body.kind)||!['private','team'].includes(body.visibility)||typeof body.allDay!=='boolean'||typeof body.description!=='string'||body.description.length>5000)throw new CalendarInputError('Preencha os dados do compromisso.');
   const parse=(value:any)=>{
    if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))throw new CalendarInputError('Informe a data e o horário.');
    const instant=new Date(value+':00-03:00');
    if(!Number.isFinite(instant.getTime())||new Date(instant.getTime()-3*3600000).toISOString().slice(0,16)!==value)throw new CalendarInputError('Data inválida.');
    return instant;
   };
   const start=parse(body.start),end=parse(body.end);
   if(end<start||(end.getTime()-start.getTime())/86400000>366)throw new CalendarInputError('O término deve ser posterior ao início, em um período de até um ano.');
   if(body.allDay&&(!body.start.endsWith('T00:00')||!body.end.endsWith('T23:59')))throw new CalendarInputError('Período de dia inteiro inválido.');
   const values=[body.id,owner,body.title.trim(),body.kind,start,end,body.allDay,body.visibility,body.description.trim(),email];
   if(old)await c.query('UPDATE web_calendar_appointments SET owner=$2,title=$3,kind=$4,starts_at=$5,ends_at=$6,all_day=$7,visibility=$8,description=$9,updated_at=now(),version=version+1 WHERE id=$1',values.slice(0,9));
   else await c.query('INSERT INTO web_calendar_appointments(id,owner,title,kind,starts_at,ends_at,all_day,visibility,description,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',values);
  }
  await c.query("INSERT INTO web_access_events(event,email,actor,details) VALUES('calendar_appointment_changed',$1,$1,$2)",[email,JSON.stringify({id:body.id,action:body.action})]);
  await c.query('COMMIT');return {saved:true};
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
