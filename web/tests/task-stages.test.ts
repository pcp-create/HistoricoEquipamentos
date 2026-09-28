import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {taskStages,saveTaskStage,reorderTaskStages} from '../lib/tasks/stages';
test('stages validate, persist, sort, audit and prevent lost updates',async()=>{
 const db=new PGlite(),g=globalThis as any,old=g.historyPool,query=db.query.bind(db);
 g.historyPool={query,connect:async()=>({query,release(){}})};
 try{
 await db.exec('CREATE ROLE anon;CREATE ROLE authenticated;');
 for(const f of ['008_administration','009_employees','024_task_stages','025_task_stage_order','026_task_stage_reordering'])await db.exec(readFileSync(new URL('../sql/'+f+'.sql',import.meta.url),'utf8'));
 await assert.rejects(()=>saveTaskStage({action:'save',job_title:'',name:'Teste',sort_order:1},'admin@example.com'),/Informe/);
 const first=await saveTaskStage({action:'save',job_title:' Comercial ',name:'Proposta',sort_order:2},'admin@example.com');
 const second=await saveTaskStage({action:'save',job_title:'Comercial',name:'Contato',sort_order:1},'admin@example.com');
 await assert.rejects(()=>saveTaskStage({action:'save',job_title:' comercial ',name:'Revisão',sort_order:1},'admin@example.com'),/ordem já/);
 await assert.rejects(()=>saveTaskStage({...first,action:'save',sort_order:1},'admin@example.com'),/ordem já/);
 assert.deepEqual((await taskStages()).stages.map(s=>s.name),['Contato','Proposta']);
 await assert.rejects(()=>saveTaskStage({action:'save',job_title:'comercial',name:'proposta',sort_order:3},'admin@example.com'),/Já existe/);
 const updated=await saveTaskStage({...first,action:'save',name:'Orçamento',sort_order:3},'admin@example.com');
 assert.equal(updated.version,2);
 const reordered=await reorderTaskStages({stages:[{id:updated.id,version:updated.version},{id:second.id,version:second.version}]},'admin@example.com');
 assert.deepEqual(reordered.map(s=>s.sort_order),[1,2]);
 assert.equal(reordered[0].id,updated.id);
 await assert.rejects(()=>reorderTaskStages({stages:[{id:updated.id,version:updated.version},{id:second.id,version:second.version}]},'admin@example.com'),/outro usuário/);
 second.version=reordered[1].version;
 await assert.rejects(()=>saveTaskStage({...first,action:'delete'},'admin@example.com'),/outro usuário/);
 await saveTaskStage({...second,action:'delete'},'admin@example.com');
 assert.equal((await taskStages()).stages.length,1);
 assert.equal((await db.query<any>("SELECT count(*)::int n FROM web_access_events WHERE event='task_stage'")).rows[0].n,4);
 }finally{g.historyPool=old;await db.close();}
});
