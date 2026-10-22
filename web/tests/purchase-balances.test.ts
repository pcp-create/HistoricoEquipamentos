import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {withPurchaseBalances} from '../lib/service-scheduling/purchase-balances';
test('purchase totals isolate companies and units, exclude closed items and distinguish partial data from zero',async()=>{
 const db=new PGlite();
 try{
  const materials=[{item_company:1,produto_id:10},{item_company:2,produto_id:10},{item_company:1,produto_id:99}];
  assert.equal((await withPurchaseBalances(materials,db as any))[0].purchases.imported,false);
  await db.exec('CREATE ROLE anon;CREATE ROLE authenticated;');
  await db.exec(readFileSync(new URL('../../supabase/migrations/017_m8_purchase_orders.sql',import.meta.url),'utf8'));
  await db.exec(`INSERT INTO m8_purchase_sync VALUES(1,now()),(2,now());
   INSERT INTO m8_purchase_orders(company_id,id,status,eligible,payload,detail_at,pending) VALUES
   (1,1,'Pendente',true,'{}',now(),false),(2,1,'Pendente',true,'{}',now(),false),(1,2,'Cancelado',false,'{}',now(),false);
   INSERT INTO m8_purchase_items VALUES
   (1,1,1,10,'1 - UNIDADE',10,10,4,true,'{}'),(1,1,2,10,'1 - UNIDADE',2,2,2,true,'{}'),
   (1,1,3,10,'LITROS',3,3,3,true,'{}'),(2,1,1,10,'UNIDADE',20,20,20,true,'{}'),
   (1,2,1,10,'UNIDADE',100,100,100,true,'{}'),(1,1,4,10,'UNIDADE',90,90,90,false,'{}');`);
  await db.exec(`UPDATE m8_purchase_orders SET payload='{"dataPrazoEntrega":"2026-11-05T03:00:00"}' WHERE company_id=1 AND id=1;
    UPDATE m8_purchase_items SET payload='{"dataPrazoEntrega":"2026-11-01T03:00:00","dataPrazoReprogramado":"2026-11-03T03:00:00"}' WHERE company_id=1 AND order_id=1 AND id=1;`);
  const result=await withPurchaseBalances(materials,db as any);
  assert.deepEqual(result[0].purchases.groups.map((g:any)=>[g.unit,g.quantity]),[['LITROS','3'],['UNIDADE','6']]);
  assert.deepEqual(result[0].purchases.groups.find((g:any)=>g.unit==='UNIDADE').deliveryDates.sort(),['2026-11-03','2026-11-05']);
  assert.deepEqual(result[1].purchases.groups[0].deliveryDates,[null]);
  assert.equal(result[1].purchases.groups[0].quantity,'20');
  assert.equal(result[2].purchases.complete,true);assert.equal(result[2].purchases.groups.length,0);
  await db.exec('UPDATE m8_purchase_orders SET pending=true WHERE company_id=1 AND id=1');
  assert.equal((await withPurchaseBalances(materials,db as any))[2].purchases.complete,false);
 }finally{await db.close();}
});
