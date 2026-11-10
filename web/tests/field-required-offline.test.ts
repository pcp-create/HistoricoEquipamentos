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

test('offline report submission validates NOK photo and comment before stopping work',()=>{
 const home:any={email:'tech',active:{operation_id:'op',kind:'work',state:'running'}};
 const detail:any={operation:{id:'op',version:1,document:{responsible:'tech',checklistRun:{template:{stages:[{id:'s',fields:[{id:'f',label:'Filtro',type:'flag2'}]}]},stages:{s:{answers:{f:'NOK'},details:{f:{comment:'Substituir ref. 123'}}}}}}},history:[]};
 const body:any={action:'report_send',offline:{capturedAt:new Date().toISOString()}};
 assert.throws(()=>projectField(home,detail,body),/foto/);assert.equal(home.active.state,'running');
 home.active=null;assert.throws(()=>projectField(home,detail,body),/foto/);
 detail.operation.document.checklistRun.stages.s.details.f.photos=['1'];projectField(home,detail,body);
 assert.ok(detail.reportSubmission);projectField(home,detail,{...body,action:'start_work'});
});

test('offline report send preserves the clock; explicit finish closes it and waits for support',()=>{
 for(const state of ['running','paused']){
  const home:any={email:'tech',displayName:'Técnico',rows:[],active:{id:'session',operation_id:'op',kind:'work',state,segment_at:'2026-11-09T12:00:00Z',active_seconds:100,pause_seconds:20}};
  const detail:any={operation:{id:'op',version:1,document:{responsible:'tech',support:['helper'],checklistId:'test',checklistRun:{template:{stages:[{id:'s',fields:[{id:'f',label:'Texto',required:true}]}]},stages:{s:{status:'released',answers:{f:'Texto'}}}}}},checked:true,infoRead:true,materials:{complete:true},history:[]};
  const result=projectField(home,detail,{action:'report_send',offline:{capturedAt:'2026-11-09T12:01:00Z'}});
  assert.equal(result.home.active.state,state);
  assert.equal(result.home.active.active_seconds,100);
  assert.ok(result.detail.reportSubmission);
  const finished=projectField(result.home,result.detail,{action:'finish_full',offline:{capturedAt:'2026-11-09T12:01:00Z'}});
  assert.equal(finished.home.active,null);assert.equal(finished.session.state,'finished');
  assert.equal(finished.detail.operation.status,'executing');
  assert.deepEqual(finished.detail.pendingTechnicians,['helper']);
  assert.throws(()=>projectField(finished.home,finished.detail,{action:'start_work',offline:{capturedAt:'2026-11-09T12:02:00Z'}}),/encerrada/);
  assert.equal(finished.session.active_seconds,state==='running'?160:100);assert.equal(finished.session.pause_seconds,state==='paused'?80:20);

  assert.ok(result.detail.reportSubmission);assert.deepEqual(result.detail.finishPending,[]);
 }
});

test('offline finalized operations reject materials and returns before mutating local stock',()=>{
 for(const status of ['awaiting_review','reviewed','completed']){
  const home={email:'tech',rows:[],active:null};
  const detail={operation:{id:'op',status,document:{responsible:'tech'}}};
  const before=JSON.stringify({home,detail});
  assert.throws(()=>projectField(home,detail,{action:'materials',offline:{capturedAt:new Date().toISOString()}}),/devoluções não são permitidas/);
  assert.equal(JSON.stringify({home,detail}),before);
 }
});
