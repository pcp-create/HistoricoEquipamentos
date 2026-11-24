import {test} from 'node:test';
import assert from 'node:assert/strict';
import {requiresAlertComment,validateAlertComments} from '../lib/service-scheduling/checklists';
import {checklistAlerts} from '../lib/service-scheduling/checklist-alerts';
const field={id:'f',label:'Inspeção',type:'flag',required:true,options:['OK','NOK','NA']};
const stage={id:'s',name:'Inspeções',fields:[field]};
test('status alerts accept an empty comment while NOK still requires a photo',()=>{
 assert.equal(requiresAlertComment(field,'NOK'),false);
 assert.equal(requiresAlertComment(field,'OK'),false);
 assert.throws(()=>validateAlertComments(stage,{f:'NOK'},{}),/foto/);
 assert.doesNotThrow(()=>validateAlertComments(stage,{f:'NOK'},{f:{photos:['1']}}));
 assert.equal(checklistAlerts({template:{stages:[stage]},stages:{s:{answers:{f:'NOK'}}}}).length,1);
});
test('other configured alerts accept empty comments and remain alerts',()=>{
 const other={...field,options:['OK','ORÇAR'],alertOptions:['ORÇAR']};
 assert.equal(requiresAlertComment(other,'ORÇAR'),false);
 assert.doesNotThrow(()=>validateAlertComments({...stage,fields:[other]},{f:'ORÇAR'},{}));
 assert.equal(checklistAlerts({template:{stages:[{...stage,fields:[other]}]},stages:{s:{answers:{f:'ORÇAR'}}}}).length,1);
});
