import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fieldOptions,validateChecklists,validateAnswers,stagesOf} from '../lib/service-scheduling/checklists';
import {checklistAlerts,validateAlertTask,alertKey,validateAlertTaskGroups,pendingChecklistAlerts} from '../lib/service-scheduling/checklist-alerts';
import {checklistReport} from '../lib/service-scheduling/checklist-report';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {mutateSchedule} from '../lib/service-scheduling/store';
import {syncTasks,listTasks} from '../lib/tasks/store';
import {createOrderTask} from '../lib/service-scheduling/order-task';
import {PDFDocument} from 'pdf-lib';
const field={id:'status',label:'Condição',type:'flag2',required:true,alertOptions:['NOK']};
const template={id:'check',name:'Inspeção',items:[],stages:[{id:'s',name:'Verificações',fields:[field]}]};
const run={template,stages:{s:{status:'submitted',answers:{status:'NOK'}}}};
test('fixed status choices reject tampering and detect only configured selected alerts',()=>{
 assert.deepEqual(fieldOptions(field),['OK','NOK','NA']);
 assert.deepEqual(fieldOptions({...field,type:'flag3'}),['Sim','Não','NA']);
 assert.deepEqual(fieldOptions({...field,type:'flag4'}),['Operando normalmente','Operando com falha','Bloqueado','Parado','Desligado / Desenergizado']);
 assert.doesNotThrow(()=>validateChecklists([template]));
 assert.throws(()=>validateChecklists([{...template,stages:[{...template.stages[0],fields:[{...field,options:['Custom']}]}]}]),/fixas/);
 assert.throws(()=>validateChecklists([{...template,stages:[{...template.stages[0],fields:[{...field,alertOptions:['Custom']}]}]}]),/alertas/);
 for(const type of ['flag2','flag3','flag4']) assert.throws(()=>validateAnswers({...template.stages[0],fields:[{...field,type}]},{status:'Custom'},true),/indicador/);
 assert.equal(checklistAlerts(run).length,1);
 assert.equal(checklistAlerts({...run,stages:{s:{answers:{status:'OK'}}}}).length,0);
 assert.equal(checklistAlerts({...run,template:{...template,stages:[{...template.stages[0],fields:[{...field,alertOptions:[]}]}]}}).length,0);
 assert.deepEqual(checklistReport(run)[0].groups[0].fields[0].alertOptions,['NOK']);
 assert.throws(()=>validateAlertTask({}),/responsável/);
 assert.throws(()=>validateAlertTask({assignedTo:'a',description:''}),/Descreva/);
 assert.throws(()=>validateAlertTask({assignedTo:'a',description:'Tratar',reportMode:'unsafe'}),/relatório/);
});
test('review atomically requires an assigned alert task, attaches a PDF and rejects duplicate/stale or unauthorized completion',async()=>{
 const db=new PGlite(),g=globalThis as any,old=g.historyPool;
 const query:any=db.query.bind(db);g.historyPool={query,connect:async()=>({query,release(){}})};
 try{
 await db.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
 for(const name of ['008_administration','009_employees','010_tasks','011_task_kanban','012_manual_tasks','016_task_order_links','022_task_activity_progress','028_service_scheduling','029_order_links','030_service_schedule_visibility','031_schedule_item_sources','037_field_operations','038_time_adjustment_requests','039_material_withdrawals']) await db.exec(readFileSync(new URL('../sql/'+name+'.sql',import.meta.url),'utf8'));
 await db.exec(`CREATE TABLE m8_ordens_servico(company_id int,id_m8 bigint,numero_sequencia bigint,cliente_nome text,equipamento text);
 CREATE TABLE m8_equipment_catalog(equipment_id bigint,name text,present boolean);
 CREATE TABLE m8_order_equipment_links(company_id int,order_id bigint,equipment_id bigint,stale boolean);
 CREATE TABLE m8_person_equipment(equipment_id bigint,person_name text,present boolean);
 CREATE TABLE web_service_checklist_photos(id bigint,operation_id uuid,content bytea);
 INSERT INTO m8_ordens_servico VALUES(1,100,12345,'Cliente','Compressor');
 INSERT INTO web_user_access(email,display_name,phone,role,updated_by) VALUES('assignee@test.com','Responsável','5547999999999','user','test');
 INSERT INTO web_service_schedules(company_id,order_id,created_by) VALUES(1,100,'test');`);
 const operationId='10000000-0000-4000-8000-000000000001';
 await query("INSERT INTO web_service_operations(id,schedule_id,position,status,document,updated_by) VALUES($1,1,1,'awaiting_review',$2,'test')",[operationId,JSON.stringify({description:'Inspeção',responsible:'assignee@test.com',checklistRun:run})]);
 const body={action:'review',scheduleId:'1',operationId,version:1};
 const admin='assignee@test.com'; // Authenticated non-admin planners can review operations.
 await assert.rejects(mutateSchedule(body,admin),/Informe um comentário/);
 assert.equal((await query('SELECT status FROM web_service_operations')).rows[0].status,'awaiting_review');
 assert.equal((await query('SELECT * FROM web_tasks')).rows.length,0);
 await query("UPDATE web_service_operations SET document=jsonb_set(document,'{checklistRun,stages,s,details}',$1::jsonb)",[JSON.stringify({status:{comment:'Vazamento identificado'}})]);

 await assert.rejects(mutateSchedule(body,admin),/responsável/);
 assert.equal((await query('SELECT status FROM web_service_operations')).rows[0].status,'awaiting_review');
 assert.equal((await query('SELECT * FROM web_tasks')).rows.length,0);
 const alertTask={assignedTo:'assignee@test.com',description:'Corrigir a falha indicada.',reportMode:'summary'};
 await assert.rejects(mutateSchedule({...body,alertTask},'missing@test.com'));
 await query("UPDATE web_user_access SET enabled=false WHERE email=$1",[admin]);
 await assert.rejects(mutateSchedule({...body,alertTask},admin));
 await query("UPDATE web_user_access SET enabled=true WHERE email=$1",[admin]);
 await assert.rejects(mutateSchedule({...body,alertTask:{...alertTask,assignedTo:'missing@test.com'}},admin),/ativo/);
 // Force attachment failure after task insertion: both task and review must roll back.
 await db.exec('ALTER TABLE web_task_attachments ADD CONSTRAINT reject_test CHECK (octet_length(content)<1)');
 await assert.rejects(mutateSchedule({...body,alertTask},admin));
 assert.equal((await query('SELECT * FROM web_tasks')).rows.length,0);
 assert.equal((await query('SELECT document FROM web_service_operations')).rows[0].document.checklistRun.reviewApplied,undefined);
 await db.exec('ALTER TABLE web_task_attachments DROP CONSTRAINT reject_test');
 const result=await mutateSchedule({...body,alertTask},admin);
 assert.equal(result.operation.status,'reviewed');
 const tasks=(await query('SELECT * FROM web_tasks')).rows;
 assert.equal(tasks.length,1);assert.equal(tasks[0].assigned_to,alertTask.assignedTo);assert.equal(String(tasks[0].order_id),'100');
 const attachment=(await query('SELECT * FROM web_task_attachments')).rows[0];
 assert.match(attachment.filename,/Operacao-01-Resumido.pdf$/);assert.equal(attachment.content_type,'application/pdf');
 assert.ok((await PDFDocument.load(attachment.content)).getPageCount()>0);
 assert.equal((await query('SELECT * FROM web_task_notifications')).rows.length,1);
 await assert.rejects(mutateSchedule({...body,alertTask},admin),/alterada/);
 // A reopened review with identical alerts reuses the existing task.
 await query("UPDATE web_service_operations SET status='awaiting_review' WHERE id=$1",[operationId]);
 await mutateSchedule({...body,version:result.operation.version},admin);
 assert.equal((await query('SELECT * FROM web_tasks')).rows.length,1);

 // Three alerts can go to two independent tasks, atomically, with only their own comments.
 const fields=[1,2,3].map(i=>({...field,id:'f'+i,label:'Alerta '+i}));
 const groupedRun={template:{...template,stages:[{id:'s',name:'Inspeções',fields}]},stages:{s:{status:'submitted',answers:{f1:'NOK',f2:'NOK',f3:'NOK'},details:{f1:{comment:'Comentário primeiro'},f2:{comment:'Comentário segundo'},f3:{comment:'Comentário terceiro'}}}}};
 const op2='10000000-0000-4000-8000-000000000002';
 await query("INSERT INTO web_service_operations(id,schedule_id,position,status,document,updated_by) VALUES($1,1,2,'awaiting_review',$2,'test')",[op2,JSON.stringify({description:'Inspeção',responsible:admin,checklistRun:groupedRun})]);
 await query("INSERT INTO web_user_access(email,display_name,phone,role,updated_by) VALUES('second@test.com','Segundo','5547999999998','user','test')");
 const keys=checklistAlerts(groupedRun).map(alertKey);
 const groups=[{...alertTask,alertKeys:keys.slice(0,2)},{...alertTask,assignedTo:'second@test.com',description:'Tratar terceiro alerta',reportMode:'complete',alertKeys:keys.slice(2)}];
 const request={action:'review',scheduleId:'1',operationId:op2,version:1};
 await assert.rejects(mutateSchedule({...request,alertTasks:[groups[0],{...groups[1],assignedTo:'missing@test.com'}]},admin),/ativo/);
 assert.equal((await query('SELECT * FROM web_tasks')).rows.length,1);
 assert.equal((await query('SELECT status FROM web_service_operations WHERE id=$1',[op2])).rows[0].status,'awaiting_review');
 await assert.rejects(mutateSchedule({...request,action:'alert_task_create',alertTasks:[groups[0]]},admin),/Ação inválida/);
 await assert.rejects(mutateSchedule({...request,alertTasks:[groups[0]]},admin),/Distribua/);
 const groupedResult=await mutateSchedule({...request,alertTasks:groups},admin);
 assert.ok((await query('SELECT filename FROM web_task_attachments')).rows.every((r:any)=>!r.filename.includes('Previo')));
 const records=groupedResult.operation.document.checklistAlertTasks;
 assert.equal(records.length,2);
 assert.deepEqual(records.map((t:any)=>t.assignedTo),[admin,'second@test.com']);
 assert.equal((await query('SELECT * FROM web_task_attachments')).rows.length,3);
 const notes=(await query("SELECT description FROM web_task_notes WHERE task_id=$1",[records[0].taskId])).rows.map((r:any)=>r.description).join(' ');
 assert.match(notes,/Comentário primeiro/);assert.match(notes,/Comentário segundo/);assert.doesNotMatch(notes,/Comentário terceiro/);
 await query("UPDATE web_task_attachments SET filename=replace(filename,'.pdf','-Previo.pdf') WHERE task_id=$1",[records[0].taskId]);
 await query("UPDATE web_service_operations SET status='awaiting_review' WHERE id=$1",[op2]);
 await mutateSchedule({...request,version:groupedResult.operation.version},admin);
 assert.equal((await query('SELECT * FROM web_tasks')).rows.length,3);
 assert.equal((await query("SELECT * FROM web_task_attachments WHERE filename LIKE '%-Previo.pdf'")).rows.length,0);
 assert.equal((await query('SELECT * FROM web_task_attachments')).rows.length,3);
 const orderTask={scheduleId:'1',requestId:'30000000-0000-4000-8000-000000000001',assignedTo:admin,description:'Encaminhar relatório ao responsável',reportMode:'summary'};
 await assert.rejects(createOrderTask(orderTask,'missing@test.com'));
 await query("UPDATE web_service_operations SET status='awaiting_review' WHERE id=$1",[op2]);
 await assert.rejects(createOrderTask(orderTask,admin),/Conclua a revisão/);
 await query("UPDATE web_service_operations SET status='reviewed' WHERE id=$1",[op2]);
 await db.exec('ALTER TABLE web_task_attachments ADD CONSTRAINT reject_test CHECK (octet_length(content)<1) NOT VALID');
 await assert.rejects(createOrderTask(orderTask,admin));
 assert.equal((await query('SELECT * FROM web_tasks')).rows.length,3);
 await db.exec('ALTER TABLE web_task_attachments DROP CONSTRAINT reject_test');
 const created=await createOrderTask(orderTask,admin);
 assert.equal((await query('SELECT * FROM web_tasks')).rows.length,4);
 const attached=(await query('SELECT filename,content FROM web_task_attachments WHERE task_id=$1',[created.taskId])).rows[0];
 assert.match(attached.filename,/unificado-Resumido.pdf$/);
 assert.ok((await PDFDocument.load(attached.content)).getPageCount()>0);
 assert.deepEqual(await createOrderTask(orderTask,admin),created);
 assert.match((await query('SELECT source_key FROM web_tasks WHERE id=$1',[created.taskId])).rows[0].source_key,/^manual:order-report-task:/);
 await syncTasks(async()=>[]);
 assert.equal((await query('SELECT status FROM web_tasks WHERE id=$1',[created.taskId])).rows[0].status,'not_started');
 // Reproduce a legacy task closed by synchronization, keeping its original audit note.
 await query("UPDATE web_tasks SET source_key=replace(source_key,'manual:',''),status='completed',source_resolved=true,updated_by='Sistema',completed_at='2026-10-21T19:57:00.123456Z' WHERE id=$1",[created.taskId]);
 await query("INSERT INTO web_task_notes(task_id,title,description,automatic,created_by,created_name,created_at) VALUES($1,'Tarefa concluída automaticamente','Processo encerrado, substituído ou removido da base ativa.',true,'Sistema','Sistema','2026-10-21T19:57:00.123456Z')",[created.taskId]);
 await syncTasks(async()=>[]);
 assert.equal((await query('SELECT status FROM web_tasks WHERE id=$1',[created.taskId])).rows[0].status,'not_started');
 assert.deepEqual(await createOrderTask(orderTask,admin),created);
 await syncTasks(async()=>[]);
 assert.equal((await query("SELECT count(*)::int n FROM web_task_notes WHERE task_id=$1 AND title='Tarefa reaberta após correção'",[created.taskId])).rows[0].n,1);

 const listed=await listTasks(new URLSearchParams({orderId:'100',orderCompany:'1'}),{id:admin,email:admin,user_metadata:{}});
 assert.ok(listed.tasks.some((t:any)=>String(t.id)===created.taskId));
 assert.equal((await listTasks(new URLSearchParams({orderId:'100',orderCompany:'2'}),{id:admin,email:admin,user_metadata:{}})).tasks.length,0);
 await assert.rejects(listTasks(new URLSearchParams({orderId:'100'}),{id:admin,email:admin,user_metadata:{}}),/empresa/);

 assert.equal((await query('SELECT * FROM web_tasks')).rows.length,4);
 }finally{g.historyPool=old;await db.close();}
});

test('alert task groups require exact, nonduplicated coverage and preserve existing assignments',()=>{
 const alerts=[1,2,3].map(i=>({stageId:'s',fieldId:'f'+i,stage:'Etapa',label:'Alerta',value:'NOK',comment:'Detalhe'}));
 const task={assignedTo:'a@test.com',description:'Corrigir',reportMode:'summary'};
 const keys=alerts.map(alertKey);
 assert.equal(validateAlertTaskGroups(alerts,[{...task,alertKeys:keys}]).length,1);
 assert.equal(validateAlertTaskGroups(alerts,keys.map(key=>({...task,alertKeys:[key]}))).length,3);
 assert.throws(()=>validateAlertTaskGroups(alerts,[{...task,alertKeys:keys.slice(1)}]),/Distribua/);
 assert.throws(()=>validateAlertTaskGroups(alerts,[{...task,alertKeys:[keys[0],keys[0],keys[2]]}]),/única tarefa/);
 assert.throws(()=>validateAlertTaskGroups(alerts,[{...task,alertKeys:['inventado']}]),/única tarefa/);
 assert.deepEqual(pendingChecklistAlerts({checklistAlertTasks:[{alerts:alerts.slice(0,2)}]},alerts),alerts.slice(2));
});
