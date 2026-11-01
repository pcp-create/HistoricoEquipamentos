import {test} from 'node:test';
import assert from 'node:assert/strict';
import {projectionPeriodLabels,projectionTargetGap} from '../lib/sales-projection/period-labels';
test('historical wording switches at the Brasilia month boundary and keeps current/future actionable',()=>{
 assert.equal(projectionPeriodLabels('2026-10',new Date('2026-11-01T02:59:59Z')).pending,'A faturar');
 const past=projectionPeriodLabels('2026-10',new Date('2026-11-01T03:00:00Z'));
 assert.deepEqual(past,{past:true,pending:'Saldo não realizado',gap:'Diferença para a meta'});
 assert.equal(projectionPeriodLabels('2026-11',new Date('2026-11-01T03:00:00Z')).pending,'A faturar');
 assert.equal(projectionPeriodLabels('2026-12',new Date('2026-11-01T03:00:00Z')).gap,'A buscar da meta');
});

test('past target difference uses billed values; current target search keeps forecast and rounds cents',()=>{
 const total={projection:1496422.68,billed:1488525.86};
 assert.equal(projectionTargetGap(1600000,total,true),111474.14);
 assert.equal(projectionTargetGap(1600000,total,false),103577.32);
 assert.equal(projectionTargetGap(100,{projection:90,billed:120},true),0);
});
