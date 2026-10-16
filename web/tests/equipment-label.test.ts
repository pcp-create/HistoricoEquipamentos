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
