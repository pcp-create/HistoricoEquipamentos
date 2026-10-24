import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {historyScheduleStatuses} from '../lib/service-scheduling/history-status';
test('history uses scheduling rules and isolates orders by company',async()=>{
 const db=new PGlite();const previous=(globalThis as any).historyPool;(globalThis as any).historyPool=db;
 try {
  await db.exec(`CREATE TABLE web_service_schedules(id int,company_id bigint,order_id bigint,active boolean);
  CREATE TABLE web_service_operations(id int,schedule_id int,status text,document jsonb);
  INSERT INTO web_service_schedules VALUES(1,1,7,true),(2,2,7,true),(3,1,8,false),(4,1,9,true);
  INSERT INTO web_service_operations VALUES(1,1,'pending','{"date":"2026-10-25","time":"08:00","responsible":"user"}'),(2,2,'executing','{}'),(3,4,'completed','{}');`);
  const result=await historyScheduleStatuses([{company_id:1,id:7,status:'Pendente'},{company_id:2,id:7,status:'Pendente'},{company_id:1,id:8,status:'Pendente'},{company_id:1,id:9,status:'Pendente'}]);
  assert.equal(result.get('1:7')?.id,'1');assert.equal(result.get('1:7')?.label,'Programado');assert.equal(result.get('2:7')?.label,'Em Execução');
  assert.equal(result.get('1:8')?.label,'Sem programação');assert.equal(result.get('1:9')?.label,'Revisada');
  const completed=await historyScheduleStatuses([{company_id:1,id:9,status:'Processado'}]);assert.equal(completed.get('1:9')?.label,'Concluída');
 } finally {(globalThis as any).historyPool=previous;await db.close();}
});
