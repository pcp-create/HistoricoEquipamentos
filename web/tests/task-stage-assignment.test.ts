import {test} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';import {readFileSync} from 'node:fs';
import {updateTask,deleteTaskNote,createTask} from '../lib/tasks/store';import {saveTaskStage} from '../lib/tasks/stages';
test('task stage changes persist, start progress, record notes and protect referenced stages',async()=>{
 const db=new PGlite(),g=globalThis as any,old=g.historyPool,query=db.query.bind(db);g.historyPool={query,connect:async()=>({query,release(){}})};
 try{await db.exec('CREATE ROLE anon;CREATE ROLE authenticated;');for(const f of ['008_administration','009_employees','010_tasks','011_task_kanban','012_manual_tasks','016_task_order_links','018_task_assignment_reason','024_task_stages','027_task_stage_assignment'])await db.exec(readFileSync(new URL('../sql/'+f+'.sql',import.meta.url),'utf8'));
 await db.exec("INSERT INTO web_tasks(source_key,cycle,origin,title,equipment_name,source_status,priority) VALUES('manual:x','manual','Tarefa manual','Teste','','manual','normal')");
 const stage=await saveTaskStage({action:'save',job_title:'Comercial',name:'Contato',sort_order:1},'a@example.com');const user={id:'u',email:'a@example.com',name:'Ana'} as any;
 const created=await createTask({title:'Nova na coluna',description:'',priority:'normal',assignedTo:'',dueDate:'',stageId:stage.id},user);assert.equal(created.task.stage_id,stage.id);
 const result=await updateTask({action:'stage',id:'1',version:1,stageId:stage.id},user);assert.equal(result.task.stage_id,stage.id);assert.equal(result.task.status,'in_progress');assert.match(result.notes[0].description,/Contato/);
 await assert.rejects(()=>saveTaskStage({action:'delete',id:stage.id,version:1},user.email),/vinculada/);
 await assert.rejects(()=>updateTask({action:'stage',id:'1',version:1,stageId:null},user),/atualizada/);
 const cleared=await updateTask({action:'stage',id:'1',version:result.task.version,stageId:null},user);assert.equal(cleared.task.stage_id,null);
 await db.exec("INSERT INTO web_user_access(email,role,enabled,updated_by) VALUES('a@example.com','user',true,'test')");
 await assert.rejects(()=>deleteTaskNote({id:'1',noteId:String(result.notes[0].id)},user),e=>(e as Error).constructor.name==='Forbidden');
 await db.exec("UPDATE web_user_access SET role='admin' WHERE email='a@example.com'");
 const removed=await deleteTaskNote({id:'1',noteId:String(result.notes[0].id)},user);
 assert.equal(removed.notes.length,1);assert.equal(removed.task.status,'in_progress');
 assert.equal((await db.query<any>("SELECT count(*)::int n FROM web_access_events WHERE event='task_note_deleted'")).rows[0].n,1);
 await assert.rejects(()=>deleteTaskNote({id:'1',noteId:String(result.notes[0].id)},user),/já foi removida/);
 cleared.task.version=removed.task.version;
 await db.exec("UPDATE web_tasks SET status='completed'");await assert.rejects(()=>updateTask({action:'stage',id:'1',version:cleared.task.version,stageId:stage.id},user),/concluídas/);
 }finally{g.historyPool=old;await db.close();}
});
