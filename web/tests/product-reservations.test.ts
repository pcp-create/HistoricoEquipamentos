import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
test('available stock exposes only M8 reservation IDs, deduplicated and scoped to company',async()=>{
 const db=new PGlite();
 try{
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE TABLE m8_ordens_servico(company_id integer,id_m8 bigint,numero_sequencia bigint,cliente_nome text,equipamento text,PRIMARY KEY(company_id,id_m8));');
  for(const name of ['006_m8_product_stock','011_m8_available_from_detailed_stock','012_m8_stock_reservations','013_m8_reservation_context'])await db.exec(readFileSync(new URL('../../supabase/migrations/'+name+'.sql',import.meta.url),'utf8'));
  await db.exec(`INSERT INTO m8_product_catalog(company_id,product_id,collected_at,payload) VALUES(1,11908,now(),'{}'),(2,11908,now(),'{}'),(1,9,now(),'{}');
   INSERT INTO m8_ordens_servico VALUES(1,14850,900,'Cliente A','Compressor A'),(2,14850,800,'Cliente B','Compressor B'),(1,9018,9018,null,null);
   INSERT INTO m8_product_stock(company_id,product_id,establishment_id,stock,available,average_cost,collected_at,payload) VALUES
   (1,11908,1,1,0,10,now(),'{"idsOs":"14850,14850,99999;bad,99999999999999999999"}'),
   (1,11908,3,0,0,10,now(),'{"idsOs":"14850"}'),
   (2,11908,2,2,2,10,now(),'{"idsOs":""}');`);
  const rows=(await db.query<any>('SELECT * FROM m8_product_current ORDER BY company_id,product_id')).rows;
  const row=rows.find(r=>r.company_id===1&&r.product_id===11908);
  assert.equal(Number(row.stock),1);assert.equal(Number(row.available),0);
  assert.deepEqual(row.reserved_orders,[{company_id:1,order_id:'99999',order_number:'99999',imported:false,customer:null,equipment:null},{company_id:1,order_id:'14850',order_number:'900',imported:true,customer:'Cliente A',equipment:'Compressor A'}]);
  assert.deepEqual(rows.find(r=>r.company_id===2).reserved_orders,[]);
  assert.deepEqual(rows.find(r=>r.product_id===9).reserved_orders,[]);
  assert.equal(rows.find(r=>r.product_id===9).available,null);
  await db.exec(`UPDATE m8_product_stock SET payload='{}' WHERE company_id=1`);
  assert.deepEqual((await db.query<any>('SELECT reserved_orders FROM m8_product_current WHERE company_id=1 AND product_id=11908')).rows[0].reserved_orders,[]);
 }finally{await db.close();}
});
