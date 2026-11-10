import {test} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';import {saveEquipment} from '../lib/equipment-management/store';import {emptyOperating} from '../lib/equipment-management/planning';
test('preventive equipment inactivation requires reason, retains local settings and never changes ERP data',async()=>{
 const db=new PGlite(),g=globalThis as any,prior=g.historyPool;const query=db.query.bind(db);g.historyPool={query,connect:async()=>({query,release(){}})};
 const user={email:'admin@test.com',display_name:'Administrador'} as any;
 try{
 await db.exec(`CREATE TABLE m8_equipment_catalog(equipment_id bigint PRIMARY KEY,payload jsonb);INSERT INTO m8_equipment_catalog VALUES(10,'{"nome":"Compressor","familiaId":3}');CREATE TABLE web_equipment_settings(equipment_id bigint PRIMARY KEY,document jsonb,version int DEFAULT 1,updated_by text,updated_at timestamptz DEFAULT now());CREATE TABLE web_equipment_events(equipment_id bigint,plan_id uuid,kind text,document jsonb,created_by text,display_name text);CREATE TABLE web_equipment_plans(equipment_id bigint,document jsonb,archived boolean);CREATE TABLE web_visit_equipment_inactivations(equipment_key text,reactivated_at timestamptz,integration_status text);`);
 await assert.rejects(()=>saveEquipment({equipment:'10',action:'inactivate',version:null,document:{reason:' '}},user),/motivo/);
 await saveEquipment({equipment:'10',action:'inactivate',version:null,document:{reason:'Equipamento vendido'}},user);
 let row=(await db.query<any>('SELECT * FROM web_equipment_settings')).rows[0];assert.equal(row.document.inactivation.reason,'Equipamento vendido');assert.equal(row.document.inactivation.by,user.email);assert.equal(row.document.inactivation.erpStatus,'not_sent');
 await assert.rejects(()=>saveEquipment({equipment:'10',action:'reactivate',version:null,document:{}},user),/alterada/);
 await saveEquipment({equipment:'10',action:'settings',version:row.version,document:emptyOperating},user);
 row=(await db.query<any>('SELECT * FROM web_equipment_settings')).rows[0];assert.equal(row.document.inactivation.reason,'Equipamento vendido');
 await saveEquipment({equipment:'10',action:'reactivate',version:row.version,document:{}},user);
 assert.equal((await db.query<any>('SELECT document FROM web_equipment_settings')).rows[0].document.inactivation,undefined);
 assert.deepEqual((await db.query<any>('SELECT payload FROM m8_equipment_catalog')).rows[0].payload,{nome:'Compressor',familiaId:3});assert.equal((await db.query<any>('SELECT count(*) n FROM web_equipment_events')).rows[0].n,3);
 }finally{g.historyPool=prior;await db.close();}
});
