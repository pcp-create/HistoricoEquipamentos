import {test} from 'node:test';
import assert from 'node:assert/strict';
import {formatOrderDetailDate,m8UpdateInstant} from '../lib/order-detail-dates';
test('business dates have no time and do not shift the calendar date',()=>{
 for(const key of ['data_abertura','data_lancamento','data_entrega_prevista','emissao']){
  assert.equal(formatOrderDetailDate(key,'2026-10-19T06:00:00Z'),'19/10/2026');
  assert.equal(formatOrderDetailDate(key,'2026-10-19'),'19/10/2026');
 }
});
test('M8 update UTC timestamps and synchronization times show Brasilia',()=>{
 assert.equal(m8UpdateInstant('2026-10-20T02:24:00'),'2026-10-20T02:24:00.000Z');
 assert.equal(formatOrderDetailDate('data_atualizacao',m8UpdateInstant('2026-10-20T02:24:00')),'19/10/2026, 23:24');
 assert.equal(m8UpdateInstant('2026-10-19T23:24:00-03:00'),'2026-10-20T02:24:00.000Z');
 assert.equal(formatOrderDetailDate('sincronizado_em','2026-10-20T02:30:00Z'),'19/10/2026, 23:30');
 assert.equal(formatOrderDetailDate('data_abertura',null),'—');
});
