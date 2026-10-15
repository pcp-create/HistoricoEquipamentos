import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {geocodePendingLocalities} from '../lib/service-scheduling/locality-geocoding';
test('background geocoding fills missing points, retries failures, invalidates changed addresses and preserves manual positions',async()=>{
 const db=new PGlite();
 try{
 await db.exec(`CREATE TABLE web_service_schedules(company_id integer,order_id bigint,active boolean);
 CREATE TABLE m8_ordens_servico(company_id integer,id_m8 bigint,cliente_id bigint);
 CREATE TABLE m8_customer_localities(company_id integer,person_id bigint,address_id bigint,present boolean,street text,number text,letter text,complement text,district text,city text,state text,postal_code text,country text);
 CREATE TABLE web_customer_map_points(person_id bigint,address_id bigint,address_hash text,latitude double precision,longitude double precision,precision text,provider text,updated_by text,updated_at timestamptz DEFAULT now(),PRIMARY KEY(person_id,address_id));
 INSERT INTO m8_customer_localities(company_id,person_id,address_id,present,street,city,state) VALUES(1,1,1,true,'A','Aurora','SC'),(1,2,1,true,'B','Aurora','SC'),(1,3,1,false,'C','Aurora','SC');`);
 await db.exec(readFileSync('sql/050_locality_geocoding.sql','utf8'));
 let calls=0;
 const locate=async()=>{calls++;return {latitude:-27,longitude:-49,precision:'address',provider:'geoapify'};};
 const run=(extra={})=>geocodePendingLocalities(db as any,{key:'fixture',locate,...extra});
 assert.equal((await run({limit:1})).updated,1);
 assert.equal((await run()).updated,1);
 assert.equal((await run()).updated,0);assert.equal(calls,2);
 await db.exec("UPDATE web_customer_map_points SET provider='manual',latitude=-28 WHERE person_id=1");
 await run();assert.equal(calls,2);
 await db.exec("UPDATE m8_customer_localities SET street='Changed' WHERE person_id=2");
 assert.equal((await run({locate:async()=>{throw Error('provider unavailable')}})).failed,1);
 await run();assert.equal(calls,2);
 await db.exec("UPDATE m8_locality_geocoding_attempts SET next_at=now()-interval '1 second'");
 assert.equal((await run()).updated,1);
 assert.equal((await db.query<{latitude:number}>("SELECT latitude FROM web_customer_map_points WHERE person_id=1")).rows[0]?.latitude,-28);
 // Address changed while the external request was in flight: do not save stale coordinates.
 await db.exec("UPDATE m8_customer_localities SET street='Again' WHERE person_id=2");
 assert.equal((await run({locate:async()=>{await db.exec("UPDATE m8_customer_localities SET street='Newer' WHERE person_id=2");return locate();}})).skipped,1);
 }finally{await db.close();}
});
