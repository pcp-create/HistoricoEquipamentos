import {test} from 'node:test';
import assert from 'node:assert/strict';
import {timeLogs,elapsedTime} from '../lib/service-scheduling/time-logs';
const at=(minute:number)=>new Date(Date.UTC(2026,8,29,10,minute)).toISOString();
test('separates pauses, travel and manual work without double counting mobile costing events',()=>{
 const sessions=[
 {id:'w',operation_id:'op1',actor:'ana',kind:'work',state:'finished',started_at:at(0),finished_at:at(60),active_seconds:2700,pause_seconds:900},
 {id:'t',operation_id:'op2',actor:'bia',kind:'travel',state:'finished',started_at:at(0),finished_at:at(30),active_seconds:1800,pause_seconds:0}
 ];
 const events=[
 {id:1,action:'pause',created_at:at(10),document:{sessionId:'w',reason:{name:'Intervalo'}}},
 {id:2,action:'resume',created_at:at(20),document:{sessionId:'w'}},
 {id:3,action:'pause',created_at:at(55),document:{sessionId:'w',reason:{name:'Aguardando'}}},
 {id:4,action:'stop',created_at:at(60),document:{sessionId:'w'}}
 ];
 const result=timeLogs(sessions,events,[
 {id:1,operation_id:'op1',actor:'ana',action:'work_log',created_at:at(60),hours:.75},
 {id:2,operation_id:'op2',actor:'bia',action:'travel_log',created_at:at(30),hours:.5},
 {id:3,operation_id:'op2',actor:'ana',action:'work_log',created_at:at(90),hours:2}
 ]);
 assert.deepEqual(result.summary,{count:3,people:2,travel:1800,work:9900,pause:900,total:12600});
 assert.deepEqual(result.rows.find(r=>r.id==='w').pauses.map((p:any)=>p.seconds),[600,300]);
 assert.equal(result.rows.find(r=>r.manual).started_at,null);
});
test('running and paused sessions include elapsed time without growing completed segments',()=>{
 const s={id:'w',operation_id:'op',actor:'ana',kind:'work',state:'paused',started_at:at(0),segment_at:at(20),active_seconds:1200,pause_seconds:0};
 const e=[{id:1,action:'pause',created_at:at(20),document:{sessionId:'w',reason:{name:'Espera'}}}];
 const result=timeLogs([s],e,[],Date.parse(at(30)));
 assert.equal(result.summary.work,1200);
 assert.equal(result.summary.pause,600);
 assert.equal(result.rows[0].pauses[0].end,null);
 assert.equal(result.rows[0].pauses[0].seconds,600);
 assert.equal(timeLogs([{...s,state:'running'}],[],[],Date.parse(at(30))).summary.work,1800);
 assert.equal(elapsedTime(90061),'25:01:01');
 assert.deepEqual(timeLogs([],[],[]).summary,{count:0,people:0,travel:0,work:0,pause:0,total:0});
});
