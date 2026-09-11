import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { serviceRows, syncServices } from '../src/sync/serviceCatalog.js';
test('service catalog retains unused services, validates responses and preserves records on failure', async () => {
  assert.throws(()=>serviceRows({data:[{id:1,nome:'Teste',precoVenda:'20'}]}));
  assert.throws(()=>serviceRows({data:[],errors:[{}]}));
  const db=new PGlite();
  try {
    await db.exec('CREATE ROLE anon; CREATE ROLE authenticated');
    await db.exec(readFileSync(new URL('../supabase/migrations/010_m8_service_catalog.sql',import.meta.url),'utf8'));
    let body: unknown={data:[{id:99,nome:'Inspeção nunca usada',unidadeNome:'H',precoVenda:200,precoVendaMinimo:100}]};
    const database={query:async(text:string,values?:unknown[])=>{
      if(text.includes('pg_try_advisory_lock')) return {rows:[{acquired:true}]};
      if(text.includes('pg_advisory_unlock')) return {rows:[]};
      return db.query(text,values);
    }};
    const client={company:1,get:async(path:string)=>{assert.equal(path,'/v1/estoque/servico');return body;}};
    await syncServices(client as any,database as any);
    assert.equal((await db.query('SELECT * FROM m8_service_catalog')).rows.length,1);
    body={data:[]}; await syncServices(client as any,database as any);
    assert.equal((await db.query('SELECT * FROM m8_service_catalog')).rows.length,1);
    body={data:null}; await assert.rejects(()=>syncServices(client as any,database as any));
    assert.equal((await db.query('SELECT * FROM m8_service_catalog')).rows.length,1);
    await db.exec('SET ROLE anon'); await assert.rejects(()=>db.query('SELECT * FROM m8_service_catalog'));
  }finally {await db.close();}
});
