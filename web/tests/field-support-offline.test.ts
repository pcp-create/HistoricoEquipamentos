import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {projectField}=createRequire(import.meta.url)('../public/field-offline/project.js');
test('offline support cannot project report changes',()=>{
 for(const action of ['report_save','report_send','report_return','checklist_save']){
  const detail={operation:{id:'op',document:{responsible:'tech',support:['helper']}}};
  assert.throws(()=>projectField({email:'helper'},detail,{action,offline:{capturedAt:new Date().toISOString()}}),/Somente o técnico responsável/);
  assert.equal(detail.operation.document.responsible,'tech');
 }
});

test('support closes before the report while responsible remains assigned',()=>{
 const home:any={email:'helper',rows:[{id:'op'}],active:null};
 const detail:any={operation:{id:'op',version:1,status:'executing',document:{responsible:'tech',support:['helper'],checklistId:'check',checklistRun:{template:{stages:[]},stages:{}}}},infoRead:true,checked:true,materials:{complete:true},progress:{work:true}};
 const body={action:'finish_full',offline:{capturedAt:'2026-11-23T12:00:00Z'}};
 projectField(home,detail,body);
 assert.equal(detail.operation.status,'executing');
 assert.deepEqual(detail.pendingTechnicians,['tech']);
 assert.deepEqual(detail.finishPending,[]);
 assert.ok(detail.operation.document.technicianClosures.helper);
 const responsible:any={email:'tech',rows:[{id:'op'}],active:null};
 assert.throws(()=>projectField(responsible,detail,body),/relatório/);
 projectField(responsible,detail,{...body,action:'report_send'});
 assert.ok(detail.operation.document.technicianClosures.helper);
 projectField(responsible,detail,body);
 assert.equal(detail.operation.status,'awaiting_review');
});
