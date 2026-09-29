import {test} from 'node:test';import assert from 'node:assert/strict';
import {combineOrderItems} from '../lib/service-scheduling/linked-items';
test('principal items precede distinct linked codes, with source identities and current costs preserved',()=>{
 const main={order:{numero_sequencia:100},materials:[{id_m8:1,produto_id:10,quantidade:2,current_average_cost:25},{id_m8:2,produto_id:20,esta_excluido:true}],services:[{id_m8:3,servico_id:15720}]};
 const linked={order:{numero_sequencia:200},materials:[{id_m8:1,produto_id:10},{id_m8:2,produto_id:20,current_average_cost:35},{id_m8:3,produto_id:30,esta_excluido:true}],services:[{id_m8:3,servico_id:15720},{id_m8:4,servico_id:99,valor_total:150}]};
 const products=combineOrderItems(main,linked,'materials',1,1,2,2);
 assert.deepEqual(products.map(x=>x.produto_id),[10,20]);assert.equal(products[1].source_linked,true);assert.equal(products[1].item_company,2);assert.equal(products[1].current_average_cost,35);
 assert.deepEqual(combineOrderItems(main,linked,'services',1,1,2,2).map(x=>x.servico_id),[15720,99]);
 assert.equal(combineOrderItems(main,null,'materials',1,1,null,null).length,1);
});

test('compares quantities across all active lines without duplicating products',()=>{
 const item=(id:number,q:number,unit='UN')=>({id_m8:id,produto_id:10,quantidade:q,unidade_nome:unit});
 const main={materials:[item(1,2),item(2,3)]};
 const combined=(materials:any[])=>combineOrderItems(main,{materials},'materials',1,1,2,2);
 assert.equal(combined([item(3,5)])[0].quantity_inconsistency,null);
 const different=combined([item(3,6)]);
 assert.equal(different.length,2);
 assert.deepEqual(different[0].quantity_inconsistency,{reason:'quantity',main:5,linked:6});
 assert.equal(combined([item(3,5,'L')])[0].quantity_inconsistency.reason,'unit');
 assert.equal(combined([{...item(3,6),esta_excluido:true}])[0].quantity_inconsistency,null);
});
