import {test} from 'node:test';
import assert from 'node:assert/strict';
import {predictPlans,preventiveCycle} from '../lib/equipment-management/preventive-hierarchy';
import {emptyOperating, type Plan} from '../lib/equipment-management/planning';
const p=(hours:number,lastMeter=0):Plan & {id:string}=>({id:String(hours),name:`Preventiva ${hours}`,hours,months:null,lastDate:'2026-01-01',lastMeter,lastOrder:'1',notes:''});
const operating={...emptyOperating,meterDate:'2026-01-01',hoursDay:8,daysYear:365};
test('larger revisions cover smaller at 4000,8000,12000; gaps retain 2000',()=>{
 for(const [meter,lastSmall,lastMedium,lastLarge,expected] of [[2000,0,0,0,2000],[4000,2000,0,0,4000],[6000,4000,4000,0,2000],[8000,6000,4000,0,8000],[10000,8000,8000,8000,2000],[12000,10000,8000,8000,12000]]){
  const rows=predictPlans([p(2000,lastSmall),p(4000,lastMedium),p(8000,lastLarge),p(12000,0)],{...operating,meter},'2026-01-01');
  assert.deepEqual(rows.filter(p=>!p.coveredBy && ['due','overdue','soon'].includes(p.forecast.status)).map(p=>p.hours),[expected]);
 }
});
test('incomplete larger revision cannot suppress valid overdue lower plans; calendar plans remain independent',()=>{
 const rows=predictPlans([p(2000),{...p(12000),lastDate:'',lastMeter:null},{...p(0),id:'calendar',hours:null,months:1}],{...operating,meter:2000},'2026-03-01');
 assert.equal(rows[0].coveredBy,null);assert.equal(rows[2].coveredBy,null);
});
test('monthly deadline groups known hourly plans even without intervention meter; does not fabricate measurements',()=>{
 const rows=predictPlans([{...p(2000),months:6,lastMeter:null},{...p(4000),months:12,lastMeter:null}],{...operating,meter:6000},'2027-01-01');
 assert.equal(rows[0].coveredBy?.id,'4000');assert.equal(rows[0].forecast.target,null);
});
test('group cycle does not depend on plan order or current larger revision',()=>{
 const plans=[p(2000),p(4000)];assert.equal(preventiveCycle(plans),preventiveCycle([...plans].reverse()));
 assert.notEqual(preventiveCycle(plans),preventiveCycle([{...p(2000),lastDate:'2026-02-01'},p(4000)]));
});
test('4000-hour target skips the scheduled 8000-hour revision without rewriting history',()=>{
 const plans=[{...p(8000,124910),months:5,lastDate:'2026-05-19'}, {...p(4000,128910),months:5,lastDate:'2026-05-19'}];
 const rows=predictPlans(plans,{...operating,meter:131944.5,meterDate:'2026-09-30'},'2026-09-30');
 assert.equal(rows[0].forecast.target,132910);
 assert.equal(rows[1].forecast.target,136910);
 assert.equal(rows[1].lastMeter,128910);
 assert.equal(rows[1].forecast.monthDate,rows[0].forecast.monthDate);
 assert.ok(rows[1].forecast.hoursDate! > rows[0].forecast.hoursDate!);
});
test('skips consecutive larger scheduled revisions, but keeps unrelated and unknown targets',()=>{
 const rows=predictPlans([p(2000),p(4000,-2000),p(8000,-4000)],{...operating,meter:0},'2026-01-01');
 assert.equal(rows[0].forecast.target,6000);
 const unknown=predictPlans([p(4000),{...p(8000),lastMeter:null}],{...operating,meter:0},'2026-01-01');
 assert.equal(unknown[0].forecast.target,4000);
 const unrelated=predictPlans([p(4000),p(8000,1000)],{...operating,meter:0},'2026-01-01');
 assert.equal(unrelated[0].forecast.target,4000);
});
test('equipment estimate is shared even when older plan readings are inconsistent',()=>{
 const plans=[{...p(24000,5991),lastDate:'2025-03-20'}, ...[4000,8000].map(h=>({...p(h,19131),lastDate:'2024-02-09'}))];
 const rows=predictPlans(plans,{...operating,hoursDay:24,meter:10230,meterDate:'2026-06-03'},'2026-09-30');
 assert.deepEqual(rows.map(r=>r.forecast.estimatedMeter),[13086,13086,13086]);
 assert.equal(rows[1].forecast.inconsistent,true);
 assert.equal(rows[1].forecast.hoursDate,null);
 assert.equal(rows[1].lastMeter,19131);
});
test('shared estimate uses the latest dated reading and does not invent missing data',()=>{
 const rows=predictPlans([p(4000,1000),{...p(8000,1500),lastDate:'2026-02-01'}],{...operating,meter:null,meterDate:''},'2026-02-02');
 assert.deepEqual(rows.map(r=>r.forecast.estimatedMeter),[1508,1508]);
 const unknown=predictPlans([{...p(4000),lastMeter:null,lastDate:''}],{...operating,meter:null,meterDate:''},'2026-02-02');
 assert.equal(unknown[0].forecast.estimatedMeter,null);
});

test('earlier larger target resets projected smaller target without changing intervention',()=>{
 const rows=predictPlans([p(2000,13515),p(4000,13515),p(8000,9059)],{...operating,meter:15062},'2026-01-01');
 assert.equal(rows[0].forecast.target,15515);
 assert.equal(rows[1].forecast.target,21059);
 assert.equal(rows[2].forecast.target,17059);
 assert.equal(rows[1].lastMeter,13515);
});
