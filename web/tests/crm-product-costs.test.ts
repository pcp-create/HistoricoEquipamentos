import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {productAverageCosts,hydrateProductCosts} from '../lib/crm/product-costs';
import {emptyDraft} from '../lib/crm/model';
import {itemFinancials} from '../lib/crm/financials';
test('CRM products use company average cost with stock weighting, precision and unit checks',async()=>{
 const db=new PGlite();try{
 await db.exec(`CREATE TABLE m8_product_catalog(company_id int,product_id bigint,unit text);
 INSERT INTO m8_product_catalog VALUES(1,1,'UN'),(2,1,'UN'),(1,2,'L'),(1,3,'UN'),(1,4,'UN'),(1,5,'UN');
 CREATE TABLE m8_product_stock(company_id int,product_id bigint,average_cost numeric,stock numeric,collected_at timestamptz DEFAULT now());
 INSERT INTO m8_product_stock(company_id,product_id,average_cost,stock) VALUES(1,1,10,1),(1,1,20,3),(2,1,999,5),(1,2,0.123456,10),(1,3,0,0),(1,4,NULL,5),(1,5,10,0),(1,5,20,0);`);
 const rows=await productAverageCosts('1',['1','2','3','4','5'],db);
 assert.equal(rows.find(r=>r.code==='1')?.unitCost,'17.5');assert.equal(rows.find(r=>r.code==='2')?.unitCost,'0.123456');assert.equal(rows.find(r=>r.code==='3')?.unitCost,'0');assert.equal(rows.find(r=>r.code==='4')?.unitCost,'');assert.equal(rows.find(r=>r.code==='5')?.unitCost,'');
 const item:any={kind:'material',code:'1',name:'Produto',quantity:'2',price:'30',unitCost:'999',quote:{unit:'UN'}};
 const draft=await hydrateProductCosts({...emptyDraft(),company:'1',items:[item,{...item,kind:'service',code:'9',unitCost:'3.25'}]},db);
 assert.equal(draft.items[0].unitCost,'17.5');assert.equal(draft.items[1].unitCost,'3.25');assert.equal(itemFinancials(draft.items[0]).profit,2500);
 const mismatch=await hydrateProductCosts({...emptyDraft(),company:'1',items:[{...item,quote:{...item.quote,unit:'L'}}]},db);assert.equal(mismatch.items[0].unitCost,'');assert.equal(mismatch.items[0].unitCostReason,'unit_mismatch');
 const noCost=await hydrateProductCosts({...emptyDraft(),company:'1',items:[{...item,code:'999'}]},db);assert.equal(noCost.items[0].unitCost,'');
 assert.equal(itemFinancials({...item,quantity:'19',unitCost:'0.123456'}).cost,235);
 assert.equal((await productAverageCosts('2',['1'],db))[0].unitCost,'999');
 await assert.rejects(()=>productAverageCosts('3',['1'],db));
 }finally{await db.close()}
});
