import {test} from 'node:test';import assert from 'node:assert/strict';
import {isMaintenancePackage,maintenanceCost} from '../lib/service-scheduling/service-costs';
test('PCT maintenance uses internal labor, preserves missing costs and distributes repeated lines without duplicating labor',()=>{
 const a={id_m8:1,servico_id:15720,servico_nome:'SERVIÇO DE MANUTENÇÃO - PCT'},b={...a,id_m8:2};
 assert.equal(isMaintenancePackage(a),true);
 assert.equal(isMaintenancePackage({servico_nome:'Outra manutenção'}),false);
 assert.equal(maintenanceCost(a,[a],160),160);
 assert.equal(maintenanceCost(a,[a],null),null);
 assert.equal(maintenanceCost(a,[a],0),0);
 assert.equal(maintenanceCost(a,[a,b],160.01)!+maintenanceCost(b,[a,b],160.01)!,160.01);
});
