import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
test('offline vehicle choice directs the odometer without changing the planned vehicle',()=>{
 const context=vm.createContext({});vm.runInContext(readFileSync('public/field-offline/project.js','utf8'),context);
 const home:any={email:'tech',active:null,rows:[]};const detail:any={operation:{id:'op',status:'executing',document:{vehicleId:'planned',responsible:'tech'},version:1},settings:{document:{vehicles:[{id:'planned',name:'Programado'},{id:'actual',name:'Utilizado'}]}},history:[]};
 const body=(action:string,extra:any={})=>({action,requestId:action,offline:{capturedAt:'2026-11-17T10:00:00Z'},...extra});
 context.projectField(home,detail,body('info_read',{vehicleId:'actual'}));assert.equal(detail.actualVehicleId,'actual');assert.equal(detail.operation.document.vehicleId,'planned');
 context.projectField(home,detail,body('start_travel',{vehicleId:'actual',odometer:100}));assert.equal(home.active.vehicle_id,'actual');assert.equal(home.active.odometer_start,100);
 assert.throws(()=>context.projectField(home,detail,body('info_read',{vehicleId:'planned'})),/Encerre o deslocamento/);
 assert.equal(detail.actualVehicleId,'actual');
});
