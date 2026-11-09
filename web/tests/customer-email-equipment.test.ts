import {test} from 'node:test';
import assert from 'node:assert/strict';
import {customerEmailEquipment,equipmentEmailBodyTemplate} from '../lib/service-scheduling/customer-email-equipment';
import {fillCustomerEmail} from '../lib/service-scheduling/customer-email-template';
test('equipment placeholders follow selected operations and retain distinct serial numbers',()=>{
 const a={id:'a',position:1,document:{equipmentId:'10',equipment:{label:'Atlas GA22',serial:'ABC'}}},b={id:'b',position:2,document:{equipmentId:'20',equipment:{label:'Atlas GA22',serial:'DEF'}}},duplicate={...a,id:'c',position:3};
 const values=customerEmailEquipment({},[duplicate,b,a]);
 assert.deepEqual(values,{equipamento:'· OP01 - Atlas GA22 · Série ABC\n· OP02 - Atlas GA22 · Série DEF\n· OP03 - Atlas GA22 · Série ABC',equipamento_01:'Atlas GA22 · Série ABC',equipamento_02:'Atlas GA22 · Série DEF'});
 assert.equal(fillCustomerEmail('{equipamento_01} / {equipamento_02} / {equipamento_03}',values),'Atlas GA22 · Série ABC / Atlas GA22 · Série DEF / ');
 assert.equal(customerEmailEquipment({},[b]).equipamento_01,'Atlas GA22 · Série DEF');
 assert.equal(customerEmailEquipment({},[b]).equipamento,'· OP02 - Atlas GA22 · Série DEF');
 assert.equal(customerEmailEquipment({},[]).equipamento,'');
 assert.deepEqual(customerEmailEquipment({equipamento:'ERP compressor',serie:'SER'},[{document:{}}]),{equipamento:'· OP01 - ERP compressor · Série SER',equipamento_01:'ERP compressor · Série SER'});
 assert.equal(customerEmailEquipment({equipamento:'ERP compressor'},[{document:{equipmentUnassigned:true}}]).equipamento,'· OP01 - Sem equipamento específico');
 assert.equal(equipmentEmailBodyTemplate('Olá'), 'Olá\n\nEquipamentos atendidos:\n{equipamento}');
 assert.equal(equipmentEmailBodyTemplate('Olá {equipamento_01}'),'Olá {equipamento_01}');
});
