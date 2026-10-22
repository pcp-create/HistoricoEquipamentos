import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {refreshOrderTypes,listOrderTypes} from '../lib/order-type-catalog';
import {refreshQuoteTypes,listQuoteTypes} from '../lib/quote-type-catalog';
test('both registries persist manual update dates only after successful manual refresh',async()=>{
 const db=new PGlite(),originalFetch=globalThis.fetch;
 const keys=['M8_TENANT','M8_USERNAME','M8_PASSWORD'] as const;
 const originalEnv=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
 for(const key of keys)process.env[key]='test';
 (globalThis as any).historyPool={query:db.query.bind(db),connect:async()=>({query:db.query.bind(db),release(){}})};
 let fail=false;
 globalThis.fetch=async(input)=>Response.json(String(input).includes('/auth/')?{data:{token:'test'}}:fail?{errors:['failure']}:{data:[{id:1,nome:'Tipo OS',descricao:'Tipo orçamento',ativo:true}]});
 try{
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
  for(const file of ['060_order_type_catalog.sql','061_quote_type_catalog.sql','062_registry_manual_updates.sql'])await db.exec(readFileSync(new URL('../sql/'+file,import.meta.url),'utf8'));
  await db.exec('ALTER TABLE m8_order_type_catalog ADD COLUMN customer_equipment_only boolean;');
  for(const [key,refresh,list] of [['order-types',refreshOrderTypes,listOrderTypes],['quote-types',refreshQuoteTypes,listQuoteTypes]] as const){
   await refresh();assert.equal((await list()).lastManualUpdate,null);
   await refresh('planner@example.com');const date=(await list()).lastManualUpdate;
   assert.ok(date);assert.equal((await list()).rows.length,1);
   assert.equal((await db.query<{updated_by:string}>('SELECT updated_by FROM registry_manual_updates WHERE registry_key=$1',[key])).rows[0]!.updated_by,'planner@example.com');
   await refresh();assert.equal((await list()).lastManualUpdate,date);
   fail=true;await assert.rejects(refresh('other@example.com'));fail=false;
   assert.equal((await list()).lastManualUpdate,date);
   assert.equal((await list()).rows.length,1);
  }
 }finally{globalThis.fetch=originalFetch;delete (globalThis as any).historyPool;for(const key of keys){if(originalEnv[key]===undefined)delete process.env[key];else process.env[key]=originalEnv[key];}await db.close();}
});
