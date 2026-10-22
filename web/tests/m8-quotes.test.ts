import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {quoteFilters,quoteHistory,quoteDetail} from '../lib/m8-quotes';
test('quote query validates filters, isolates company and searches imported products',async()=>{
 const db=new PGlite();
 (globalThis as any).historyPool=db;
 try{
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
  await db.exec(readFileSync(new URL('../../supabase/migrations/016_m8_quotes.sql',import.meta.url),'utf8'));
  await db.exec(`INSERT INTO m8_quotes(company_id,id,number,emission,total,payload,client,client_id) VALUES(1,7,'A','2026-10-21',20,'{}','João','5'),(2,7,'B','2026-10-21',25,'{}','Maria','6'); INSERT INTO m8_quote_items VALUES(2,7,'produto',1,'{"produtoNome":"Filtro especial"}');`);
  assert.equal((await quoteHistory(new URLSearchParams('company=1'))).rows[0]?.number,'A');
  assert.equal((await quoteHistory(new URLSearchParams('product=especial'))).rows[0]?.number,'B');
  assert.equal((await quoteHistory(new URLSearchParams('client=joao'))).total,1);
  assert.equal((await quoteHistory(new URLSearchParams("q=' OR 1=1 --"))).total,0);
  assert.equal((await quoteDetail('1','7'))?.products.length,0);
  assert.equal((await quoteDetail('2','7'))?.products.length,1);
  await db.exec(`INSERT INTO m8_quote_items VALUES(2,7,'produto',2,'{"produtoNome":"Óleo","produtoId":50,"quantidade":2,"valorUnitario":5,"valorTotal":10}'),(1,7,'produto',2,'{"produtoNome":"Filtro outra empresa"}');`);
  const materialRows=await quoteHistory(new URLSearchParams('view=materials'));
  assert.equal(materialRows.total,3);
  assert.equal((await quoteHistory(new URLSearchParams('view=materials&product=especial'))).total,1);
  assert.equal((await quoteHistory(new URLSearchParams('view=materials&q=especial'))).total,1);
  const oil=await quoteHistory(new URLSearchParams('view=materials&company=2&product=oleo'),true);
  assert.equal(oil.rows[0]?.material,'Óleo');assert.equal(oil.rows[0]?.quantity,'2');assert.equal(oil.rows[0]?.material_total,'10');
  assert.equal((await quoteHistory(new URLSearchParams('view=materials&company=1'))).total,1);
  for(const q of ['view=invalid','company=9' ,'size=100000','from=2026-02-30','page=-1','from=2026-10-22&to=2026-10-21'])assert.throws(()=>quoteFilters(new URLSearchParams(q)));
 }finally{delete (globalThis as any).historyPool;await db.close();}
});
