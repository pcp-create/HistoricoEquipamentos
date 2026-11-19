import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {workshopRentalWarning} from '../lib/workshop/rental-warning';
test('exit warning ignores closed orders, rejected materials and component visits',async()=>{
 const db=new PGlite(),g=globalThis as any,old=g.historyPool;
 g.historyPool={query:(sql:string,args:any[])=>db.query(sql,args)};
 const visit='10000000-0000-4000-8000-000000000001';
 try{
 await db.exec(`CREATE TABLE web_workshop_visits(id uuid,equipment_id bigint,source jsonb,exited_at timestamptz,reconciled_out_at timestamptz);
 CREATE TABLE m8_os_produtos(produto_id bigint,company_id int,ordem_servico_id bigint,esta_excluido boolean,aprovado text);
 CREATE TABLE m8_ordens_servico(id_m8 bigint,company_id int,numero_sequencia bigint,cliente_nome text,tipo_id text,status text);
 INSERT INTO web_workshop_visits VALUES('${visit}',100,'{}',null,null);
 INSERT INTO m8_ordens_servico SELECT n,1,15000+n,'Cliente','8','Pendente' FROM generate_series(1,6)n;
 INSERT INTO m8_os_produtos SELECT 100,1,n,false,'sim' FROM generate_series(1,6)n;
 INSERT INTO m8_os_produtos VALUES(100,1,1,false,'sim');
 UPDATE m8_os_produtos SET esta_excluido=true WHERE ordem_servico_id=2;
 UPDATE m8_os_produtos SET aprovado='não' WHERE ordem_servico_id=3;
 UPDATE m8_ordens_servico SET status='Processado' WHERE id_m8=4;
 UPDATE m8_ordens_servico SET tipo_id='45' WHERE id_m8=5;
 UPDATE m8_os_produtos SET produto_id=101 WHERE ordem_servico_id=6;`);
 assert.deepEqual((await workshopRentalWarning(visit)).orders,[{id:'1',company:1,number:'15001',customer:'Cliente'}]);
 await db.exec(`UPDATE web_workshop_visits SET source='{"entryKind":"component"}'`);
 assert.equal((await workshopRentalWarning(visit)).orders.length,0);
 await db.exec(`UPDATE web_workshop_visits SET source='{}',exited_at=now()`);
 assert.equal((await workshopRentalWarning(visit)).orders.length,0);
 await db.exec(`UPDATE web_workshop_visits SET exited_at=null,reconciled_out_at=now()`);
 assert.equal((await workshopRentalWarning(visit)).orders.length,0);
 }finally{g.historyPool=old;await db.close();}
});
