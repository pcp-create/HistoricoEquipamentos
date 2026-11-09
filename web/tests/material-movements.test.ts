import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {withMaterialMovements,materialMovementTotals} from '../lib/service-scheduling/material-movements';
test('movement quantities use gross withdrawals and do not double-count returns declared and received',()=>{
 const rows=[{withdrawn:5,used:99,allocations:[{quantity:5,gross:8,returned:3}]}];
 assert.deepEqual(materialMovementTotals(rows,8,3),{withdrawn:8,returned:3,used:5});
 assert.deepEqual(materialMovementTotals(rows,8,4),{withdrawn:8,returned:4,used:4});
 assert.deepEqual(materialMovementTotals([{withdrawn:2.7,allocations:[{quantity:2.7,returned:.3}]}]),{withdrawn:3,returned:.3,used:2.7});
 assert.deepEqual(materialMovementTotals([{withdrawn:2,allocations:null}]),{withdrawn:2,returned:0,used:2});
 assert.deepEqual(materialMovementTotals([]),{withdrawn:0,returned:0,used:0});
});
test('programming quantities combine both portals and isolate company, order and item, including linked orders',async()=>{
 const db=new PGlite();try{
 await db.exec(`CREATE TABLE web_user_access(email text,display_name text);
 CREATE TABLE web_warehouse_batches(id text,technician text,kind text);
 CREATE TABLE web_warehouse_delivery_items(batch_id text,company_id int,order_id bigint,item_id bigint,quantity numeric);
 CREATE TABLE web_service_item_usage(schedule_id bigint,item_company int,item_order bigint,item_id bigint,withdrawn numeric,used numeric,allocations jsonb);
 INSERT INTO web_user_access VALUES('tech','Técnico');
 INSERT INTO web_warehouse_batches VALUES('out','tech','delivery'),('back','tech','receipt');
 INSERT INTO web_warehouse_delivery_items VALUES('out',1,100,7,8),('back',1,100,7,3),('out',2,200,7,2),('back',2,200,7,1),('out',2,100,7,99);
 INSERT INTO web_service_item_usage VALUES(1,1,100,7,5,99,'[{"quantity":5,"gross":8,"returned":3}]');`);
 const items=[{item_company:1,item_order:'100',id_m8:'7'},{item_company:2,item_order:'200',id_m8:'7'},{item_company:1,item_order:'100',id_m8:'8'}];
 const result=await withMaterialMovements(items,db);
 assert.deepEqual(result.map(i=>i.movement),[{withdrawn:8,returned:3,used:5,delivered:8,returnedInApp:3,received:3},{withdrawn:2,returned:1,used:1,delivered:2,returnedInApp:0,received:1},{withdrawn:0,returned:0,used:0,delivered:0,returnedInApp:0,received:0}]);
 assert.equal((await db.query<any>('SELECT used FROM web_service_item_usage')).rows[0].used,'99','consultation never changes process records');
 }finally{await db.close();}
});
