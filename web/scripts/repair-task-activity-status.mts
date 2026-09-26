import {Client} from 'pg';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
const db=new Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:true,ca:readFileSync(new URL('../certs/supabase-ca.crt',import.meta.url),'utf8')}});
try {
 await db.connect(); await db.query('BEGIN');
 await db.query(readFileSync(new URL('../sql/022_task_activity_progress.sql',import.meta.url),'utf8'));
 const rows=(await db.query(`SELECT t.*,n.id activity_id,n.title activity_title,n.created_by activity_actor,n.created_at activity_at FROM web_tasks t JOIN LATERAL (
 SELECT n.* FROM web_task_notes n WHERE n.task_id=t.id AND web_task_note_is_activity(n.automatic,n.title)
 AND NOT EXISTS(SELECT 1 FROM web_task_notes reset WHERE reset.task_id=t.id AND reset.id>n.id AND reset.title IN ('Tarefa reaberta','Status ajustado em massa','Status de execução alterado'))
 ORDER BY n.id DESC LIMIT 1) n ON true WHERE t.status='not_started' ORDER BY t.id FOR UPDATE OF t`)).rows;
 console.log(JSON.stringify({candidates:rows.length,titles:rows.reduce((a,r)=>(a[r.activity_title]=(a[r.activity_title]||0)+1,a),{}),task1438:rows.filter(r=>String(r.id)==='1438').map(r=>({id:r.id,status:r.status,evidence:r.activity_title}))}));
 if(!process.argv.includes('--apply')) {await db.query('ROLLBACK');}
 else {
 const batch=randomUUID(),folder=new URL('../../.m8/task-activity-repair/',import.meta.url); mkdirSync(folder,{recursive:true});writeFileSync(new URL(batch+'.json',folder),JSON.stringify(rows,null,2),{mode:0o600});
 for(const t of rows) {
 await db.query("UPDATE web_tasks SET status='in_progress',kanban_column='in_progress',updated_at=now(),updated_by='Sistema',version=version+1 WHERE id=$1",[t.id]);
 await db.query("INSERT INTO web_task_notes(task_id,title,description,automatic,created_by,created_name) VALUES($1,'Andamento corrigido após tratativa',$2,true,'Sistema','Sistema')",[t.id,`Alterado de Não iniciado para Em andamento devido à tratativa registrada: ${t.activity_title} (nota ${t.activity_id}). Lote ${batch}.`]);
 }
 await db.query('COMMIT'); console.log(JSON.stringify({updated:rows.length,batch}));
 }
} catch(e) {await db.query('ROLLBACK').catch(()=>{});console.error(e instanceof Error?e.message:'Falha');process.exitCode=1;} finally {await db.end();}
