import {test} from 'node:test';import assert from 'node:assert/strict';
import {isMaintenancePackage,maintenanceCost,primaryOrderRevenue} from '../lib/service-scheduling/service-costs';
test('PCT maintenance uses internal labor, preserves missing costs and distributes repeated lines without duplicating labor',()=>{
 const a={id_m8:1,servico_id:15720,servico_nome:'SERVIÇO DE MANUTENÇÃO - PCT'},b={...a,id_m8:2};
 assert.equal(isMaintenancePackage(a),true);
 assert.equal(isMaintenancePackage({servico_nome:'Outra manutenção'}),false);
 assert.equal(maintenanceCost(a,[a],160),160);
 assert.equal(maintenanceCost(a,[a],null),null);
 assert.equal(maintenanceCost(a,[a],0),0);
 assert.equal(maintenanceCost(a,[a,b],160.01)!+maintenanceCost(b,[a,b],160.01)!,160.01);
});

test('revenue excludes linked material and service sales without removing their costs',()=>{
 const materials=[{valor_total:'1000',cost:200,source_linked:false},{valor_total:'9000',cost:300,source_linked:true}];
 const services=[{valor_total:'500',cost:100,source_linked:false},{valor_total:'5000',cost:200,source_linked:true}];
 const sale=primaryOrderRevenue(materials)+primaryOrderRevenue(services);
 const cost=[...materials,...services].reduce((total,item)=>total+item.cost,0);
 assert.equal(sale,1500);
 assert.equal(cost,800);
 assert.equal(sale-cost,700);
 assert.equal((sale-cost)/cost*100,87.5);
 assert.equal(primaryOrderRevenue([]),0);
 assert.equal(primaryOrderRevenue([{valor_total:250}]),250);
 assert.equal(primaryOrderRevenue([{valor_total:250,source_linked:true}]),0);
});
