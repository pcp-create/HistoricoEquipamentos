import {mkdirSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {database} from '../lib/db';
import {taskSources} from '../lib/tasks/sources';
import {syncTasks} from '../lib/tasks/store';
const apply=process.argv.includes('--apply');
const db=database();
const batch=randomUUID();
const folder=new URL('../../.m8/preventive-task-rebuild/',import.meta.url);
mkdirSync(folder,{recursive:true});
const c=await db.connect();
try {
 await c.query('BEGIN READ WRITE');
 await c.query('SELECT pg_advisory_xact_lock(81021,1)');
 const old=(await c.query("SELECT * FROM web_tasks WHERE source_key LIKE 'preventive:%' OR source_key LIKE 'preventive-group:%' ORDER BY id FOR UPDATE")).rows;
 const sources=(await taskSources(true)).filter(s=>s.key.startsWith('preventive'));
 const active=sources.filter(s=>s.alert);
 const ids=old.map(t=>String(t.id));
 const summary={batch,mode:apply?'apply':'preview',oldTasks:old.length,oldOpen:old.filter(t=>t.status!=='completed').length,oldCompleted:old.filter(t=>t.status==='completed').length,newTasks:active.length,groupedHourly:active.filter(s=>s.key.startsWith('preventive-group:')).length,independentCalendar:active.filter(s=>s.key.startsWith('preventive:')).length};
 if (!apply) {
  writeFileSync(new URL(batch+'-preview.json',folder),JSON.stringify({summary,old:old.map(t=>({id:t.id,equipment:t.equipment_id,title:t.title,status:t.status})),planned:active},null,2),{mode:0o600});
  await c.query('ROLLBACK'); console.log(JSON.stringify(summary));
 } else {
  const tables=['web_task_quote_links','web_task_notes','web_task_attachments','web_task_notifications','web_task_reminders'];
  const backup:any={batch,tasks:old};
  for(const table of tables) backup[table]=(await c.query(`SELECT * FROM ${table} WHERE task_id=ANY($1::bigint[]) FOR UPDATE`,[ids])).rows;
  if(['web_task_notifications','web_task_reminders'].some(table=>backup[table].some((n:any)=>n.state==='pending' && n.leased_until && new Date(n.leased_until).getTime()>Date.now()))) throw Error('Há notificações em envio. Aguarde as execuções em curso antes de limpar.');
  writeFileSync(new URL(batch+'-backup.json',folder),JSON.stringify(backup,null,2),{mode:0o600});
  for(const table of tables) await c.query(`DELETE FROM ${table} WHERE task_id=ANY($1::bigint[])`,[ids]);
  await c.query('DELETE FROM web_tasks WHERE id=ANY($1::bigint[])',[ids]);
  await c.query('UPDATE web_task_hierarchy SET enabled=true WHERE id=1');
  const result=await syncTasks(async()=>sources,{client:c,silent:true,preventiveOnly:true});
  // The rebuild starts a fresh work queue, retaining automatic assignment but not
  // assuming that assignment means work has already started.
  await c.query("UPDATE web_tasks SET status='not_started',kanban_column='pending' WHERE source_key LIKE 'preventive%' AND status<>'completed'");
  const pending=(await c.query("SELECT count(*)::int n FROM web_task_notifications n JOIN web_tasks t ON t.id=n.task_id WHERE t.source_key LIKE 'preventive%' AND n.state='pending'")).rows[0].n;
  if(pending || result.created!==active.length) throw Error('Falha na conferência de tarefas/avisos');
  await c.query('COMMIT');
  writeFileSync(new URL(batch+'-result.json',folder),JSON.stringify({...summary,...result,pendingNotifications:pending},null,2),{mode:0o600});
  console.log(JSON.stringify({...summary,...result,pendingNotifications:pending}));
 }
} catch(e) {await c.query('ROLLBACK');console.error(e instanceof Error?e.message:'Falha no reprocessamento');process.exitCode=1;} finally {c.release();await db.end();}
