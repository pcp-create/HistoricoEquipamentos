import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pendingTechnicianClosures,technicianTimeChangesLocked,readyForReviewAfterClosures} from '../lib/service-scheduling/execution-locks';
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

test('removing the pending helper releases an already closed lead only after report and sessions are complete',()=>{
 const document:any={requireTechnicianClosure:true,responsible:'lead',support:['helper'],checklistId:'check',checklistRun:{submission:{by:'lead',at:'2026-11-16T14:45:59.132Z'}},technicianClosures:{lead:{at:'2026-11-16T14:46:08.304Z'}}};
 const operation={status:'executing',document};
 assert.equal(readyForReviewAfterClosures(operation,false),false);
 document.support=[];
 assert.equal(readyForReviewAfterClosures(operation,false),true);
 assert.equal(readyForReviewAfterClosures(operation,true),false);
 assert.equal(technicianTimeChangesLocked(operation,'lead'),true);
 document.support=['replacement'];assert.equal(readyForReviewAfterClosures(operation,false),false);
 document.support=[];delete document.checklistRun.submission;assert.equal(readyForReviewAfterClosures(operation,false),false);
 document.checklistId='';assert.equal(readyForReviewAfterClosures(operation,false),true);
 delete document.technicianClosures.lead;assert.equal(readyForReviewAfterClosures(operation,false),false);
});
