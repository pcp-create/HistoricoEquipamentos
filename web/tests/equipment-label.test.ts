import test from 'node:test';
import assert from 'node:assert/strict';
import {operationEquipmentLabel} from '../lib/service-scheduling/equipment-label';
test('OS visible code is not replaced by the database equipment ID',()=>{
 const order={produto_equipamento_id:22599,equipamento:'2171 – COMPRESSOR DE PARAFUSO – TPF100 – SÉRIE A COLETAR'};
 const selected={equipmentId:'22599',equipment:{name:'COMPRESSOR DE PARAFUSO – TPF100 – SÉRIE A COLETAR'}};
 assert.equal(operationEquipmentLabel(selected,order),order.equipamento);
 assert.equal(operationEquipmentLabel({},order),order.equipamento);
 assert.equal(operationEquipmentLabel({...selected,equipmentId:'8',equipment:{name:'Outro equipamento'}},order),'8 · Outro equipamento');
 assert.equal(selected.equipmentId,'22599');
});

test('calendar labels use each assigned operation equipment and leave unassigned operations empty',()=>{
 assert.equal(operationEquipmentLabel({equipmentId:'10',equipment:{label:'Compressor A · Série 123'}},null),'Compressor A · Série 123');
 assert.equal(operationEquipmentLabel({equipmentId:'20',equipment:{name:'Secador B'}},null),'20 · Secador B');
 assert.equal(operationEquipmentLabel({},null),'');
});
