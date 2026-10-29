import { test } from 'node:test';
import assert from 'node:assert/strict';
import { movements } from '../lib/workshop/movements';
test('counts real exits, open entries and returns; does not count reconciliation as exit',()=>{
 const visits=[{entered_at:'2026-10-01T12:00:00Z',exited_at:'2026-10-05T12:00:00Z'},{entered_at:'2026-10-06T12:00:00Z'},{entered_at:'2026-09-10T12:00:00Z',reconciled_out_at:'2026-10-10T12:00:00Z'}];
 assert.deepEqual(movements(visits,'2026-10-01','2026-10-31','month'),[{date:'2026-10-01',entries:2,exits:1}]);
});
test('uses Brasilia date and Monday weeks, keeping empty buckets',()=>{
 const rows=movements([{entered_at:'2026-10-05T01:00:00Z',exited_at:'2026-10-05T13:00:00Z'}],'2026-10-01','2026-10-18','week');
 assert.deepEqual(rows,[{date:'2026-09-28',entries:1,exits:0},{date:'2026-10-05',entries:0,exits:1},{date:'2026-10-12',entries:0,exits:0}]);
});
test('daily and annual totals include interval endpoints',()=>{
 const visits=[{entered_at:'2025-12-31T12:00:00Z',exited_at:'2026-01-01T12:00:00Z'}];
 assert.deepEqual(movements(visits,'2025-12-31','2026-01-01','day').map(r=>[r.entries,r.exits]),[[1,0],[0,1]]);
 assert.equal(movements(visits,'2025-12-31','2026-01-01','year').length,2);
});

test('occupancy includes earlier stays and subtracts real exits and reconciliations', async()=>{
 const {workshopEvolution}=await import('../lib/workshop/movements');
 const visits=[{entered_at:'2026-09-01T12:00:00Z',exited_at:'2026-10-05T12:00:00Z'},{entered_at:'2026-09-02T12:00:00Z',reconciled_out_at:'2026-10-06T12:00:00Z'},{entered_at:'2026-10-03T12:00:00Z'}];
 const rows=workshopEvolution(visits,'2026-10-01','2026-10-08','week');
 assert.deepEqual(rows.map(r=>r.occupancy),[3,1]);
 assert.equal(rows[1].exits,1);
 assert.equal(rows[1].adjustments,1);
 for(const row of rows) assert.equal(row.occupancy,row.opening+row.entries-row.exits-row.adjustments);
 assert.equal(rows[0].startDate,'2026-10-01');
 assert.equal(rows[1].endDate,'2026-10-08');
});

test('reversed entries never affect movements, opening stock, occupancy or reconciliation adjustments', async()=>{
 const {workshopEvolution}=await import('../lib/workshop/movements');
 const visits=[{entered_at:'2026-09-01T12:00:00Z',reconciled_out_at:'2026-10-05T12:00:00Z',source:{entry_reversed:true}}, {entered_at:'2026-10-02T12:00:00Z',reconciled_out_at:'2026-10-05T12:00:00Z',source:{entry_reversed:true}}, {entered_at:'2026-10-03T12:00:00Z'}];
 assert.deepEqual(movements(visits,'2026-10-01','2026-10-31','month'),[{date:'2026-10-01',entries:1,exits:0}]);
 const rows=workshopEvolution(visits,'2026-10-01','2026-10-31','month');
 assert.equal(rows[0].opening,0);assert.equal(rows[0].occupancy,1);assert.equal(rows[0].adjustments,0);
});
