import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {projectField}=createRequire(import.meta.url)('../public/field-offline/project.js');
test('offline send rejects missing grouped required fields before changing local state',()=>{
 for(const value of [undefined,'','   ']){
  const home={email:'tech',active:{operation_id:'op',kind:'work',state:'running'}};
  const detail={operation:{id:'op',document:{responsible:'tech',checklistRun:{template:{stages:[{id:'s',groups:[{fields:[{id:'temperature',label:'Temperatura',required:true}]}]}]},stages:{s:{answers:{temperature:42}}}}}}};
  const before=JSON.stringify(detail);
  assert.throws(()=>projectField(home,detail,{action:'report_send',stages:[{stageId:'s',answers:{temperature:value}}],offline:{capturedAt:new Date().toISOString()}}),/Preencha: Temperatura/);
  assert.equal(JSON.stringify(detail),before);
 }
});
