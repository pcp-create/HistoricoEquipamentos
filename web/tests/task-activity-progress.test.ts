import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
test('treatment starts pending tasks but initialization, explicit resets and completed history do not',async()=>{
 const db=new PGlite();
 try {
 await db.exec(`CREATE TABLE web_tasks(id bigint primary key,status text,kanban_column text); CREATE TABLE web_task_notes(task_id bigint,title text,automatic boolean); INSERT INTO web_tasks VALUES(1,'not_started','pending'),(2,'completed',null);`);
 await db.exec(readFileSync(new URL('../sql/022_task_activity_progress.sql',import.meta.url),'utf8'));
 const status=async(id=1)=>(await db.query<{status:string}>('SELECT status FROM web_tasks WHERE id=$1',[id])).rows[0].status;
 for(const [title,automatic] of [['Alerta identificado',true],['Atribuição automática',true],['Tarefa manual criada',false],['Tarefa reaberta',false],['Status de execução alterado',false]] as const){
 await db.query('INSERT INTO web_task_notes VALUES(1,$1,$2)',[title,automatic]);assert.equal(await status(),'not_started');
 }
 for(const [title,automatic] of [['Contato com cliente',false],['Anexo incluído',false],['Responsável / prioridade atualizados',false],['Alerta agendado',false],['OS vinculada atualizada',true],['Orçamento criado',true]] as const){
 await db.exec("UPDATE web_tasks SET status='not_started',kanban_column='pending' WHERE id=1");
 await db.query('INSERT INTO web_task_notes VALUES(1,$1,$2),(2,$1,$2)',[title,automatic]);
 assert.equal(await status(),'in_progress'); assert.equal(await status(2),'completed');
 }
 await db.exec("UPDATE web_tasks SET status='not_started' WHERE id=1");
 await db.exec("BEGIN; INSERT INTO web_task_notes VALUES(1,'Tentativa',false); ROLLBACK;");assert.equal(await status(),'not_started');
 } finally {await db.close();}
});
