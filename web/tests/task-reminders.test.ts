import {test} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';import {readFileSync} from 'node:fs';
import {saveReminder,listReminders,claimReminders,acknowledgeReminder,reminderInstant} from '../lib/tasks/reminders';
test('scheduled reminders validate time, lease once, acknowledge and cancel without affecting assignments',async()=>{
 const db=new PGlite(),g=globalThis as any,old=g.historyPool,query=db.query.bind(db);g.historyPool={query,connect:async()=>({query,release(){}})};
 try{
 await db.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
 for(const f of ['008_administration','009_employees','010_tasks','011_task_kanban','012_manual_tasks','017_task_reminders'])await db.exec(readFileSync(new URL('../sql/'+f+'.sql',import.meta.url),'utf8'));
 await db.exec(`INSERT INTO web_user_access(email,display_name,phone,updated_by) VALUES('a@example.com','Pessoa','5547999999999','test');INSERT INTO web_tasks(source_key,cycle,origin,title,equipment_name,source_status,priority,assigned_to) VALUES('manual:x','manual','Tarefa manual','Teste','','manual','normal','a@example.com');`);
 assert.throws(()=>reminderInstant('2020-01-01T10:00'),/futuras/);
 assert.throws(()=>reminderInstant('2099-02-30T10:00'),/futuras/);
 assert.equal(reminderInstant('2099-01-01T07:30'),'2099-01-01T10:30:00.000Z');
 await saveReminder({action:'create',taskId:'1',when:'2099-01-01T07:30'},'a@example.com');
 await assert.rejects(()=>saveReminder({action:'create',taskId:'1',when:'2099-01-01T07:30'},'a@example.com'),/Já existe/);
 assert.equal((await claimReminders('https://app.example')).length,0);
 await db.exec("UPDATE web_task_reminders SET scheduled_at=now()-interval '1 minute'");
 const claimed=await claimReminders('https://app.example');assert.equal(claimed.length,1);assert.match(claimed[0].text,/Lembrete de tarefa/);
 assert.equal((await claimReminders('https://app.example')).length,0);
 await assert.rejects(()=>saveReminder({action:'cancel',taskId:'1',id:'1'},'a@example.com'),/em envio/);
 await acknowledgeReminder('1',claimed[0].token);await acknowledgeReminder('1',claimed[0].token);
 assert.equal((await listReminders('1'))[0].state,'sent');
 await saveReminder({action:'create',taskId:'1',when:'2099-01-02T07:30'},'a@example.com');
 const pending=(await listReminders('1')).find(r=>r.state==='pending');
 await saveReminder({action:'cancel',taskId:'1',id:pending.id},'a@example.com');
 assert.equal((await listReminders('1')).find(r=>r.id===pending.id).state,'cancelled');
 await saveReminder({action:'create',taskId:'1',when:'2099-01-03T07:30'},'a@example.com');
 await db.exec("UPDATE web_tasks SET status='completed';UPDATE web_task_reminders SET scheduled_at=now()-interval '2 minutes' WHERE state='pending'");
 assert.equal((await claimReminders('https://app.example')).length,0);
 assert.equal((await db.query<any>("SELECT state FROM web_task_reminders WHERE state='skipped'")).rows.length,1);
 }finally{g.historyPool=old;await db.close();}
});
