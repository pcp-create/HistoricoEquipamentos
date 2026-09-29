import {test} from 'node:test';
import assert from 'node:assert/strict';
import {prepareChecklistSubmission} from '../lib/service-scheduling/checklist-store';
test('full submission validates saved drafts and submits all stages atomically',()=>{
 const run={template:{id:'t',name:'Checklist',stages:[{id:'s',name:'Inspeção',fields:[{id:'f',label:'Resultado',type:'text',required:true}]}]},stages:{s:{status:'released',answers:{f:''}}}};
 assert.throws(()=>prepareChecklistSubmission(run,'tech'));
 run.stages.s.answers.f='Conferido';
 const submitted=prepareChecklistSubmission(run,'tech');
 assert.equal(submitted.stages.s.status,'submitted');
 assert.equal(submitted.stages.s.submittedBy,'tech');
 assert.equal(run.stages.s.status,'released');
});
