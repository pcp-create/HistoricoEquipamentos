import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pendingTechnicianClosures,technicianTimeChangesLocked} from '../lib/service-scheduling/execution-locks';
import {reviewChecklist} from '../lib/service-scheduling/checklist-review';
test('review waits for every assigned technician and personal closure only locks that technician',async()=>{
 const document:any={requireTechnicianClosure:true,responsible:'lead',support:['helper'],checklistRun:{submission:{by:'lead'}},technicianClosures:{lead:{at:'2026-11-10'}}};
 const operation={status:'executing',document};
 assert.deepEqual(pendingTechnicianClosures(document),['helper']);
 assert.equal(technicianTimeChangesLocked(operation,'lead'),true);
 assert.equal(technicianTimeChangesLocked(operation,'helper'),false);
 await assert.rejects(reviewChecklist({},operation,{}, {},'planner'),/todos os técnicos/);
 document.technicianClosures.helper={at:'2026-11-10'};
 assert.deepEqual(pendingTechnicianClosures(document),[]);
 assert.equal(technicianTimeChangesLocked(operation,'helper'),true);
});
