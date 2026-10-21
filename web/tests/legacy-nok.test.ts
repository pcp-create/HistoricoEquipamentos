import {test} from 'node:test';
import assert from 'node:assert/strict';
import {requiresAlertComment,validateAlertComments} from '../lib/service-scheduling/checklists';
import {checklistAlerts} from '../lib/service-scheduling/checklist-alerts';
const field={id:'f',label:'Inspeção',type:'flag',required:true,options:['OK','NOK','NA']};
const stage={id:'s',name:'Inspeções',fields:[field]};
test('legacy NOK is an alert with a mandatory nonblank comment, even without comment configuration',()=>{
 assert.equal(requiresAlertComment(field,'NOK'),true);
 assert.equal(requiresAlertComment(field,'OK'),false);
 assert.equal(requiresAlertComment(field,'NA'),false);
 for(const comment of [undefined,'','  '])assert.throws(()=>validateAlertComments(stage,{f:'NOK'},{f:{comment}}),/comentário/);
 assert.doesNotThrow(()=>validateAlertComments(stage,{f:'NOK'},{f:{comment:'Vazamento identificado'}}));
 assert.equal(checklistAlerts({template:{stages:[stage]},stages:{s:{answers:{f:'NOK'}}}}).length,1);
});
test('explicit alert configurations are preserved, including disabled alerts and other status values',()=>{
 assert.equal(requiresAlertComment({...field,alertOptions:[]},'NOK'),false);
 assert.equal(requiresAlertComment({...field,alertOptions:['NA']},'NA'),true);
 assert.equal(requiresAlertComment({...field,alertOptions:['NA']},'NOK'),false);
});
