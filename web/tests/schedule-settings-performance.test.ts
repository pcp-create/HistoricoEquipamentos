import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mutateSchedule} from '../lib/service-scheduling/store';
import {validateSettings} from '../lib/service-scheduling/model';

test('adding vehicles avoids reading or rewriting operations; removals still protect references',async()=>{
 const g=globalThis as any,previousPool=g.historyPool;
 let settings={version:1,document:validateSettings({serviceTypes:['Interno'],vehicles:[],checklists:[],calendars:[{id:'standard',name:'Padrão',week:[{day:1,start:'08:00',end:'18:00'}]}]})};
 let reads=0,writes=0;
 const query=async(sql:string,args:any[]=[])=>{
  if(sql.includes('SELECT role,enabled'))return {rows:[{role:'admin',enabled:true}]};
  if(sql.includes('SELECT * FROM web_service_schedule_settings'))return {rows:[settings]};
  if(sql.includes('SELECT * FROM web_service_operations')){reads++;return {rows:[{id:'op',status:'pending',document:{vehicleId:'van',calendarId:'standard'},ends_at:null}]};}
  if(sql.startsWith('UPDATE web_service_operations')){writes++;return {rows:[]};}
  if(sql.startsWith('UPDATE web_service_schedule_settings')){settings={version:settings.version+1,document:JSON.parse(args[0])};return {rows:[settings]};}
  return {rows:[]};
 };
 g.historyPool={connect:async()=>({query,release(){}})};
 try{
  await mutateSchedule({action:'settings',version:1,document:{...settings.document,vehicles:[{id:'van',name:'Van'}]}},'admin@test');
  assert.equal(reads,0);assert.equal(writes,0);assert.equal(settings.version,2);
  await assert.rejects(mutateSchedule({action:'settings',version:2,document:{...settings.document,vehicles:[]}},'admin@test'),/Não remova configurações/);
  assert.equal(reads,1);assert.equal(settings.version,2);
  await mutateSchedule({action:'settings',version:2,document:{...settings.document,calendars:settings.document.calendars.map((c:any)=>({...c,week:[{day:1,start:'09:00',end:'18:00'}]}))}},'admin@test');
  assert.equal(reads,2);assert.equal(writes,0,'unscheduled operations with unchanged end dates must retain their version');
 }finally{g.historyPool=previousPool;}
});
