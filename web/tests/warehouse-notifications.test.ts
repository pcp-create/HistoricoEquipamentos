import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {queueWarehouseMaterialNotification,claimWarehouseNotifications,acknowledgeWarehouseNotification} from '../lib/warehouse/notifications';

test('warehouse WhatsApp waits for manager and phone configuration, uses inclusion actor hierarchy and claims once',async()=>{
 const db=new PGlite(),g=globalThis as any,old=g.historyPool;
 const query=(sql:string,args?:any[])=>db.query(sql.replace('BEGIN READ WRITE','BEGIN'),args);
 g.historyPool={query,connect:async()=>({query,release(){}})};
 try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE TABLE web_user_access(email text PRIMARY KEY,display_name text,enabled boolean,phone text,managers jsonb);
   INSERT INTO web_user_access VALUES('warehouse','Almoxarife',true,null,'[]'),('manager','Gestor',true,null,'[]'),('other','Outro gestor',true,'5547999999998','[]');`);
  for(const file of ['083_warehouse_deliveries','084_warehouse_returns','085_warehouse_notifications'])await db.exec(readFileSync('sql/'+file+'.sql','utf8'));
  const id=randomUUID();await db.query("INSERT INTO web_warehouse_material_additions(id,company_id,order_id,actor,document,state) VALUES($1,1,100,'warehouse','{}','complete')",[id]);
  const document={orderNumber:'15100',company:1,customer:'Cliente',equipment:'Compressor',productCode:'7',productName:'Filtro',quantity:2,unit:'UN',price:10,total:20,justification:'Reposição'};
  await queueWarehouseMaterialNotification({query},id,'warehouse',document);
  await queueWarehouseMaterialNotification({query},id,'warehouse',document);
  assert.equal((await claimWarehouseNotifications()).length,0);
  assert.equal((await db.query('SELECT * FROM web_warehouse_notification_events')).rows.length,1);
  await db.exec(`UPDATE web_user_access SET managers='["manager"]' WHERE email='warehouse'`);
  assert.equal((await claimWarehouseNotifications()).length,0);
  assert.equal((await db.query('SELECT * FROM web_warehouse_notifications')).rows.length,1);
  await db.exec("UPDATE web_user_access SET phone='5547999999999' WHERE email='manager'");
  const notices=await claimWarehouseNotifications();assert.equal(notices.length,1);assert.equal(notices[0].number,'5547999999999');
  assert.match(notices[0].text,/Almoxarife/);assert.match(notices[0].text,/Reposição/);
  assert.equal((await claimWarehouseNotifications()).length,0);
  await assert.rejects(acknowledgeWarehouseNotification(notices[0].id.slice(10),randomUUID()));
  await acknowledgeWarehouseNotification(notices[0].id.slice(10),notices[0].token);
  await acknowledgeWarehouseNotification(notices[0].id.slice(10),notices[0].token);
  assert.equal((await db.query<any>('SELECT state FROM web_warehouse_notifications')).rows[0].state,'sent');
 }finally{g.historyPool=old;await db.close();}
});
