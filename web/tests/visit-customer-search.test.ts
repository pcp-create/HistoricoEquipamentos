import {test} from 'node:test';
import assert from 'node:assert/strict';
import {customerTradeName} from '../lib/visits/model';
test('customer search includes the M8 trade name with fallback for directory variants',()=>{
 assert.equal(customerTradeName({nomeFantasia:'COOPERSULCA',fantasia:'COOPERSULCA'}),'COOPERSULCA');
 assert.equal(customerTradeName({nomeFantasia:' ',fantasia:'COOPERSULCA'}),'COOPERSULCA');
 assert.equal(customerTradeName({apelido:'Cooperativa'}),'Cooperativa');
 assert.equal(customerTradeName(null),'');
});
