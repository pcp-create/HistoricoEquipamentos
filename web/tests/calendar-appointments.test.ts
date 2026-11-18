import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {saveAppointment} from '../lib/calendar/appointments';
test('appointments enforce ownership, periods, versions and cancellation',async()=>{
 const db=new PGlite();try{
 await db.exec("CREATE ROLE anon;CREATE ROLE authenticated;CREATE TABLE web_user_access(email text,role text,enabled boolean);INSERT INTO web_user_access VALUES('one@test','user',true),('two@test','user',true),('admin@test','admin',true);CREATE TABLE web_access_events(event text,email text,actor text,details jsonb);");
 await db.exec(readFileSync('sql/119_calendar_appointments.sql','utf8'));
 const pool={connect:async()=>({query:(...args:any[])=> (db.query as any)(...args),release(){}})};
 const form={id:'11111111-1111-4111-8111-111111111111',owner:'one@test',action:'save',kind:'personal',title:'Consulta',start:'2026-11-18T09:00',end:'2026-11-18T10:00',allDay:false,visibility:'private',description:''};
 await saveAppointment('one@test',form,pool);
 assert.equal((await db.query<any>('SELECT starts_at FROM web_calendar_appointments')).rows[0].starts_at.toISOString(),'2026-11-18T12:00:00.000Z');
 await assert.rejects(()=>saveAppointment('two@test',{...form,version:1},pool));
 await assert.rejects(()=>saveAppointment('one@test',{...form,version:1,end:'2026-11-17T09:00'},pool));
 await assert.rejects(()=>saveAppointment('one@test',{...form,version:1,start:'2026-02-30T09:00'},pool));
 await saveAppointment('one@test',{...form,version:1,title:'Consulta atualizada'},pool);
 await assert.rejects(()=>saveAppointment('one@test',{...form,version:1},pool));
 await saveAppointment('admin@test',{...form,action:'cancel',version:2},pool);
 assert((await db.query<any>('SELECT cancelled_at FROM web_calendar_appointments')).rows[0].cancelled_at);
 }finally{await db.close();}
});
