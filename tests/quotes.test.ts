import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {saveQuoteHeaders,refreshQuoteDetails,quoteRows} from '../src/sync/quotes.js';
test('quote snapshots isolate companies, queue changes and preserve complete details on failure',async()=>{
 const db=new PGlite();
 try{
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
  await db.exec(await readFile(new URL('../supabase/migrations/016_m8_quotes.sql',import.meta.url),'utf8'));
  const body={data:[{id:7,numeroProposta:'P-7',revisao:0,clienteNome:'Cliente',total:12,dataEmissao:'2026-10-21T03:00:00'}]};
  await saveQuoteHeaders(db,1,body);await saveQuoteHeaders(db,2,body);
  const client={company:1,get:async(path:string)=>({data:[{id:1,orcamentoId:7,descricao:path.split('/').pop()}]})};
  await refreshQuoteDetails(db,client,'7');
  assert.equal((await db.query<{n:number}>('SELECT count(*)::int n FROM m8_quote_items')).rows[0]!.n,3);
  assert.equal((await db.query<{pending:boolean}>('SELECT pending FROM m8_quotes WHERE company_id=1')).rows[0]!.pending,false);
  await saveQuoteHeaders(db,1,body);
  assert.equal((await db.query<{pending:boolean}>('SELECT pending FROM m8_quotes WHERE company_id=1')).rows[0]!.pending,false);
  await saveQuoteHeaders(db,1,{data:[{...body.data[0],total:15}]});
  assert.equal((await db.query<{pending:boolean}>('SELECT pending FROM m8_quotes WHERE company_id=1')).rows[0]!.pending,true);
  assert.equal((await db.query<{total:string}>('SELECT total::text FROM m8_quotes WHERE company_id=2')).rows[0]!.total,'12');
  await assert.rejects(refreshQuoteDetails(db,{company:1,get:async(path:string)=>{if(path.endsWith('servico'))throw new Error('offline');return {data:[]};}},'7'));
  assert.equal((await db.query<{n:number}>('SELECT count(*)::int n FROM m8_quote_items')).rows[0]!.n,3);
  await assert.rejects(refreshQuoteDetails(db,{company:1,get:async()=>({data:[{id:1,orcamentoId:999}]})},'7'));
  await refreshQuoteDetails(db,{company:1,get:async()=>({data:[]})},'7');
  assert.equal((await db.query<{n:number}>('SELECT count(*)::int n FROM m8_quote_items')).rows[0]!.n,0);
  await saveQuoteHeaders(db,1,{data:[]});
  assert.equal((await db.query<{n:number}>('SELECT count(*)::int n FROM m8_quotes')).rows[0]!.n,2);
 }finally{await db.close();}
});
test('invalid and conflicting headers are rejected before writing',()=>{
 assert.throws(()=>quoteRows({data:[{id:1}]}));
 assert.throws(()=>quoteRows({data:[{id:1,numeroProposta:'A'},{id:1,numeroProposta:'B'}]}));
 assert.throws(()=>quoteRows({data:[],errors:['error']}));
});
