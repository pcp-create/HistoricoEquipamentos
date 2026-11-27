import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initializeChecklist} from '../lib/service-scheduling/initialize-checklist';
test('initializes missing checklist and preserves existing responses',()=>{
 const templates=[{id:'t',name:'Relatório',items:[],stages:[{id:'s',name:'Inspeção',fields:[]}]}];
 const document={checklistId:'t',responsible:'tech',checked:{materials:true}};
 const next=initializeChecklist(document,templates,'planner');
 assert.equal(next.checklistRun.stages.s.status,'released');
 assert.deepEqual(next.checked,document.checked);
 assert.equal('checklistRun' in document,false);
 next.checklistRun.stages.s.answers.value=42;
 assert.equal(initializeChecklist(next,templates,'planner'),next);
 assert.equal(next.checklistRun.stages.s.answers.value,42);
 assert.throws(()=>initializeChecklist(document,[],'planner'),/não encontrado/);
});
