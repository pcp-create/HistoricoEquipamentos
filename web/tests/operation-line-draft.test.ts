import {test} from 'node:test';import assert from 'node:assert/strict';
import {operationLineChanged,operationDurationOnlyChanged,mergeOperationLine} from '../lib/service-scheduling/operation-line-draft';

test('review and report metadata changes do not mark the scheduling row unsaved',()=>{
 const original:any={description:'Manutenção',duration:1,responsible:'tech',support:[],date:'2026-11-24',time:'08:00',internalNote:'',checklistRun:{submission:{at:'old'}}};
 const afterReview={...original,checklistRun:{submission:{at:'new'},reviewApplied:{by:'planner'}},technicianClosures:{tech:{at:'now'}},equipment:{name:'Compressor'}};
 assert.equal(operationLineChanged(original,afterReview),false);
 assert.equal(operationLineChanged({...original,description:'Alterada'},afterReview),true);
 assert.equal(operationLineChanged({...original,duration:2},afterReview),true);
 assert.equal(operationDurationOnlyChanged({...original,duration:2},afterReview),true);
 assert.equal(operationDurationOnlyChanged({...original,duration:2,description:'Alterada'},afterReview),false);
 const merged=mergeOperationLine({...original,description:'Alterada'},afterReview);
 assert.deepEqual(merged.checklistRun,afterReview.checklistRun);
 assert.deepEqual(merged.technicianClosures,afterReview.technicianClosures);
 assert.equal(merged.description,'Alterada');
});
