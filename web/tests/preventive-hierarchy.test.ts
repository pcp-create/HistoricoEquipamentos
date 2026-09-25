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
