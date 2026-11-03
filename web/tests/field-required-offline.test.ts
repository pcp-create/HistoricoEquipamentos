import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {projectField}=createRequire(import.meta.url)('../public/field-offline/project.js');
test('offline send rejects missing grouped required fields before changing local state',()=>{
 for(const value of [undefined,'','   ']){
  const home={email:'tech',active:null};
  const detail={operation:{id:'op',document:{responsible:'tech',checklistRun:{template:{stages:[{id:'s',groups:[{fields:[{id:'temperature',label:'Temperatura',required:true}]}]}]},stages:{s:{answers:{temperature:42}}}}}}};
  const before=JSON.stringify(detail);
  assert.throws(()=>projectField(home,detail,{action:'report_send',stages:[{stageId:'s',answers:{temperature:value}}],offline:{capturedAt:new Date().toISOString()}}),/Preencha: Temperatura/);
  assert.equal(JSON.stringify(detail),before);
 }
});

test('offline report submission requires the timer to stop, and NOK requires item photo and comment',()=>{
 const home:any={email:'tech',active:{operation_id:'op',kind:'work',state:'running'}};
 const detail:any={operation:{id:'op',version:1,document:{responsible:'tech',checklistRun:{template:{stages:[{id:'s',fields:[{id:'f',label:'Filtro',type:'flag2'}]}]},stages:{s:{answers:{f:'NOK'},details:{f:{comment:'Substituir ref. 123'}}}}}}},history:[]};
 const body:any={action:'report_send',offline:{capturedAt:new Date().toISOString()}};
 assert.throws(()=>projectField(home,detail,body),/Finalize o apontamento/);
 home.active=null;assert.throws(()=>projectField(home,detail,body),/foto/);
 detail.operation.document.checklistRun.stages.s.details.f.photos=['1'];projectField(home,detail,body);
 assert.ok(detail.reportSubmission);assert.throws(()=>projectField(home,detail,{...body,action:'start_work'}),/Relatório enviado/);
});
