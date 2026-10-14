import {test} from 'node:test';
import assert from 'node:assert/strict';
import {singleCustomerLabel} from '../lib/service-scheduling/customer-map-label';
test('nome em grupos aparece apenas para um único cliente',()=>{
 assert.equal(singleCustomerLabel([{customerId:'1',customer:'Empresa - 12.345.678/0001-90'},{customerId:'1',customer:'Empresa'}]),'Empresa');
 assert.equal(singleCustomerLabel([{customerId:'1',customer:'Empresa'},{customerId:'2',customer:'Empresa'}]),null);
 assert.equal(singleCustomerLabel([{customer:'Empresa'},{customer:'Outra'}]),null);
 assert.equal(singleCustomerLabel([{customer:'Empresa'},{customer:'Empresa'}]),'Empresa');
 assert.equal(singleCustomerLabel([]),null);
});
