import {test} from 'node:test';
import assert from 'node:assert/strict';
import {customerOrderSellers} from '../lib/service-orders/sellers';
test('seller catalog stays available independently of the customer default',async()=>{
 const catalog=[{id:10,razaoSocial:'Padrão',ativo:true},{id:20,razaoSocial:'Outro',ativo:true},{id:30,razaoSocial:'Inativo',ativo:false},{id:40,razaoSocial:'Bloqueado',ativo:true,bloqueado:'Sim'}];
 let links:any[]=[{vendedorId:10,padrao:true}],fail=false;
 const api=async(path:string)=>{if(path.includes('/cliente/')){if(fail)throw Error('Falha');return links;}return catalog;};
 let result=await customerOrderSellers(api as any,'7');assert.equal(result.defaultSellerId,'10');assert.equal(result.rows.length,4);assert.equal(result.rows.find(r=>r.id==='20')?.disabled,false);assert.equal(result.rows.find(r=>r.id==='30')?.disabled,true);assert.equal(result.rows.find(r=>r.id==='40')?.disabled,true);
 links=[];result=await customerOrderSellers(api as any,'8');assert.equal(result.defaultSellerId,null);assert.equal(result.rows.length,4);
 links=[{vendedorId:20,padrao:false}];assert.equal((await customerOrderSellers(api as any,'8')).defaultSellerId,'20');
 links=[{vendedorId:10},{vendedorId:20}];assert.equal((await customerOrderSellers(api as any,'8')).defaultSellerId,null);
 links=[{vendedorId:30,padrao:true}];assert.equal((await customerOrderSellers(api as any,'8')).defaultSellerId,null);
 fail=true;result=await customerOrderSellers(api as any,'8');assert.equal(result.rows.length,4);assert.equal(result.defaultSellerId,null);assert.match(result.warning||'',/manualmente/);
});
