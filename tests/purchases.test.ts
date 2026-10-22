import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {purchaseHeader,purchaseItem,purchasePages,savePurchaseHeaders,refreshPurchase} from '../src/sync/purchases.js';
const header={id:7,status:'Pendente',ativo:true,statusAprovacao:'Aguardando'};
const item={id:1,ordemCompraId:7,produtoId:10,unidadeNome:'1 - UNIDADE',quantidade:10,quantidadeComprada:10,saldo:4,itemTransferido:false};
test('purchase eligibility uses outstanding balance, excludes closed/rejected/transferred and validates payload',()=>{
 assert.equal(purchaseHeader(header).eligible,true);
 assert.equal(purchaseHeader({...header,status:11,statusNome:'ParcialmenteAtendido'}).eligible,true);
 assert.throws(()=>purchaseHeader({...header,status:11}));
 for(const status of ['Cancelado','Processado'])assert.equal(purchaseHeader({...header,status}).eligible,false);
 assert.equal(purchaseHeader({...header,ativo:false}).eligible,false);
 assert.equal(purchaseHeader({...header,statusAprovacao:'Reprovado'}).eligible,false);
 assert.equal(purchaseItem(item,'7').balance,4);
 assert.equal(purchaseItem({...item,saldo:-2},'7').balance,0);
 assert.equal(purchaseItem({...item,itemTransferido:true},'7').eligible,false);
 assert.equal(purchaseItem({...item,statusItemNome:'Cancelado'},'7').eligible,false);
 assert.throws(()=>purchaseItem({...item,saldo:null},'7'));
 assert.throws(()=>purchaseItem(item,'8'));
});
test('purchase pagination collects all pages and rejects repeats and API errors',async()=>{
 const page=Array.from({length:1000},(_,n)=>({id:n+1}));
 assert.equal((await purchasePages({get:async(_p,p)=>({data:p.Page===1?page:[{id:1001}]})},'/v1/test')).length,1001);
 await assert.rejects(purchasePages({get:async()=>({data:page})},'/v1/test'),/repetiu/);
 await assert.rejects(purchasePages({get:async()=>({data:[],errors:['failed']})},'/v1/test'));
});
test('purchase snapshots isolate companies, preserve items on failure and replace complete snapshots atomically',async()=>{
 const db=new PGlite();
 try{
  await db.exec('CREATE ROLE anon;CREATE ROLE authenticated;');
  await db.exec(await readFile(new URL('../supabase/migrations/017_m8_purchase_orders.sql',import.meta.url),'utf8'));
  await savePurchaseHeaders(db,1,[header]);await savePurchaseHeaders(db,2,[header]);
  const client={company:1,get:async(path:string)=>({data:path.endsWith('/item')?[item]:[header]})};
  await refreshPurchase(db,client,'7');
  assert.equal((await db.query<{balance:string}>('SELECT balance::text FROM m8_purchase_items')).rows[0]!.balance,'4');
  await assert.rejects(refreshPurchase(db,{...client,get:async(path)=>{if(path.endsWith('/item'))throw Error('offline');return {data:[header]};}},'7'));
  assert.equal((await db.query('SELECT * FROM m8_purchase_items')).rows.length,1);
  assert.equal((await db.query('SELECT * FROM m8_purchase_orders WHERE company_id=2 AND detail_at IS NULL')).rows.length,1);
  await refreshPurchase(db,{...client,get:async(path)=>({data:path.endsWith('/item')?[]:[header]})},'7');
  assert.equal((await db.query('SELECT * FROM m8_purchase_items')).rows.length,0);
  await refreshPurchase(db,client,'7');
  await refreshPurchase(db,{...client,get:async()=>({data:[]})},'7');
  assert.equal((await db.query<{present:boolean}>('SELECT present FROM m8_purchase_orders WHERE company_id=1')).rows[0]!.present,false);
  assert.equal((await db.query('SELECT * FROM m8_purchase_items')).rows.length,1,'Missing header preserves historical items');
 }finally{await db.close();}
});
