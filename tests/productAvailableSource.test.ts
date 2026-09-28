import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
test('available uses detailed stock per company, preserves unknown/zero/negative and ignores newer batch zeros',async()=>{
 const db=new PGlite();
 try {
 await db.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
 for(const file of ['006_m8_product_stock.sql','011_m8_available_from_detailed_stock.sql']) await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
 await db.exec(`INSERT INTO m8_product_catalog(company_id,product_id,collected_at,payload) VALUES(1,19420,now(),'{}'),(2,19420,now(),'{}'),(1,99,now(),'{}'),(1,98,now(),'{}');
 INSERT INTO m8_product_stock(company_id,product_id,establishment_id,stock,available,collected_at,payload) VALUES(1,19420,1,1194.5,329,'2026-09-27','{}'),(2,19420,2,-233,-262,'2026-09-27','{}'),(1,98,1,0,0,'2026-09-27','{}');
 INSERT INTO m8_product_available VALUES(1,19420,1,0,'2026-09-28'),(1,99,1,0,'2026-09-28');`);
 const rows=(await db.query<any>('SELECT company_id,product_id,available::text,available_at::text FROM m8_product_current')).rows;
 assert.equal(rows.find(r=>r.company_id===1 && r.product_id===19420)?.available,'329');
 assert.equal(rows.find(r=>r.company_id===2)?.available,'-262');
 assert.equal(rows.find(r=>r.product_id===99)?.available,null);
 assert.equal(rows.find(r=>r.product_id===98)?.available,'0');
 assert.match(rows.find(r=>r.product_id===19420)?.available_at,/2026-09-27/);
 await db.exec("INSERT INTO m8_product_stock(company_id,product_id,establishment_id,available,collected_at,payload) VALUES(1,19420,3,NULL,'2026-09-27','{}')");
 assert.equal((await db.query<any>('SELECT available FROM m8_product_current WHERE company_id=1 AND product_id=19420')).rows[0].available,null);
 } finally {await db.close();}
});
