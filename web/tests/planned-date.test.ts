import {test} from 'node:test';
import assert from 'node:assert/strict';
import {plannedDate,nextWorkingDay} from '../lib/service-scheduling/planned-date';
const calendar={week:[1,2,3,4,5].map(day=>({day,start:'08:00',end:'17:00'})),exceptions:[{startDate:'2026-11-02',endDate:'2026-11-02',hours:[]}]};
const base={schedule:{calendar_operations:[]},materials:[],external:[],complete:true,calendar,today:'2026-10-30'};
const material={produto_id:'1',produto_nome:'Filtro',item_company:1,quantidade:2,unidade_nome:'UN',current:{unit:'UN',available:'0',available_at:'2026-10-30'},purchases:{imported:true,complete:true,groups:[{unit:'UN',quantity:'2',orders:['99'],deliveryDates:['2026-11-04']}]}};
test('ready OS uses next working day, honoring weekends and calendar exceptions',()=>{
 assert.equal(plannedDate(base).date,'2026-11-03');
 assert.equal(nextWorkingDay('2026-10-30',null),null);
 assert.equal(plannedDate({...base,calendar:null}).source,'unknown');
});
test('latest purchase or external return plus exactly one working day wins',()=>{
 const r=plannedDate({...base,materials:[material],external:[{component:'Motor',expected_at:'2026-11-06'}]});
 assert.equal(r.date,'2026-11-09');assert.match(r.reason,/Motor/);
 const m=plannedDate({...base,materials:[material],external:[{component:'Motor',expected_at:'2026-11-03'}]});
 assert.equal(m.date,'2026-11-05');assert.match(m.reason,/OC 99/);
});
test('earliest pending programmed operation overrides estimates; finished operations excluded',()=>{
 const r=plannedDate({...base,complete:false,schedule:{calendar_operations:[
 {position:1,date:'2026-11-01',status:'completed'},
 {position:2,date:'2026-11-12',time:'08:00',status:'awaiting_execution'},
 {position:3,date:'2026-11-05',time:'10:00',status:'executing'},
 ]}});
 assert.equal(r.date,'2026-11-05');assert.equal(r.source,'scheduled');assert.match(r.reason,/Operação 3/);
});
test('unknown stock, incomplete collection, missing/overdue dates and insufficient purchase never imply readiness',()=>{
 for(const input of [
 {...base,complete:false},
 {...base,materials:[{...material,current:null}]},
 {...base,materials:[{...material,quantidade:4}]},
 {...base,materials:[{...material,purchases:{...material.purchases,groups:[]}}]},
 {...base,external:[{component:'Motor',expected_at:null}]},
 {...base,external:[{component:'Motor',expected_at:'2026-10-29'}]},
 ]){assert.equal(plannedDate(input).date,null);assert.equal(plannedDate(input).source,'unknown');}
});
test('withdrawn materials and returned components do not delay programming',()=>{
 assert.equal(plannedDate({...base,materials:[{...material,withdrawn:2,current:null}],external:[{component:'Motor',returned_at:'2026-10-29',expected_at:null}]}).date,'2026-11-03');
});
test('repeated materials share stock and purchases do not mix units',()=>{
 const m={...material,current:{...material.current,available:'2'},purchases:{...material.purchases,groups:[]}};
 assert.equal(plannedDate({...base,materials:[m,m]}).source,'unknown');
 assert.equal(plannedDate({...base,materials:[{...material,unidade_nome:'L'}]}).source,'unknown');
});
