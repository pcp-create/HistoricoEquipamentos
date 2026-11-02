import {test} from 'node:test';
import assert from 'node:assert/strict';
import {plannedDateSignal} from '../lib/service-scheduling/planned-date-signal';
import type {PlannedDate} from '../lib/service-scheduling/planned-date';
test('signal distinguishes ready, dependent, scheduled, overdue and finished orders',()=>{
 const signal=(patch:Partial<PlannedDate>)=>plannedDateSignal({date:'2026-11-04',source:'estimated',reason:'',...patch},'2026-11-03').state;
 assert.equal(signal({requiresAttention:false}),'ready');
 assert.equal(signal({requiresAttention:true}),'attention');
 assert.equal(signal({source:'unknown',date:null}),'attention');
 assert.equal(signal({source:'scheduled'}),'scheduled');
 assert.equal(signal({source:'scheduled',date:'2026-11-02'}),'overdue');
 assert.equal(signal({source:'scheduled',date:'2026-11-03'}),'scheduled');
 assert.equal(signal({source:'finished',date:null}),'finished');
 assert.equal(signal({}),'attention');
});
