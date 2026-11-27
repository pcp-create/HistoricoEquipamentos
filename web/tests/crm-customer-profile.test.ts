import test from 'node:test';
import assert from 'node:assert/strict';
import {customerProfile} from '../lib/crm/customer-profile';
test('customer profile supports optional fields and all parts preferences',()=>{
 assert.equal(customerProfile().partsType,'');
 for(const partsType of ['original','aftermarket','mixed','unknown']){
  const saved=customerProfile({partsType,currentBrands:' Schulz ',partsBrands:'Marca A',offeredBrands:'Marca B',servicePartner:'Oficina atual',competitors:'Concorrente',profileNotes:'Prioriza garantia'});
  assert.equal(saved.currentBrands,'Schulz');
  assert.deepEqual(customerProfile(JSON.parse(JSON.stringify(saved))),saved);
 }
});
test('customer profile rejects malformed values and excessive text',()=>{
 assert.throws(()=>customerProfile([]));
 assert.throws(()=>customerProfile({partsType:'invalid'}));
 assert.throws(()=>customerProfile({competitors:'x'.repeat(501)}));
});
