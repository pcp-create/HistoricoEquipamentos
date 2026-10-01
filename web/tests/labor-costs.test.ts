import {test} from 'node:test';
import assert from 'node:assert/strict';
import {includesLaborCost} from '../lib/service-scheduling/labor-costs';
test('existing services count internal and external labor, excluding third parties by default',()=>{
 for(const name of ['Interno','Externo']) assert.equal(includesLaborCost({},name),true);
 for(const name of ['Terceiro','Terceirizado','Serviço terceiro']) assert.equal(includesLaborCost({},name),false);
 assert.equal(includesLaborCost({serviceTypeLaborCosts:{Externo:false}},'Externo'),false);
 assert.equal(includesLaborCost({serviceTypeLaborCosts:{Terceiro:true}},'Terceiro'),true);
});
