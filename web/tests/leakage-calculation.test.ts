import {test}from'node:test';import assert from'node:assert/strict';
import{calculateMachines}from'../public/tools/leak-calculation.mjs';
import{validateLeakage}from'../lib/leakage-reports/model';
const machine=(name:string,powerKw:number,flowM3min:number,hoursPerDay:number,daysPerYear:number,index=1)=>({id:`12345678-1234-4234-8234-${String(index).padStart(12,'0')}`,name,powerKw,flowM3min,hoursPerDay,daysPerYear});
test('spreadsheet formulas preserve sum PE, flow-weighted PE and specific-power-weighted annual hours',()=>{
 const c=calculateMachines([machine('GA160 VSD',160,30.5,10.96,365),machine('GA160 FF',160,30.5,10.95,274,2),machine('GA90',90,17.46,10.95,274,3),machine('GA75',75,15,10.96,365,4)]);
 const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-9,`${a} ≠ ${b}`);
 close(c.powerKw,485);close(c.flowM3min,93.46);close(c.specificPowerSum,0.34410737423243759);close(c.weightedSpecificPower,0.086489763891861041);close(c.annualHours,3496.6046903777683);close(c.dailyHours,9.5797388777473103);
 assert.notEqual(c.specificPowerSum,c.weightedSpecificPower);
});
test('server recalculates totals instead of accepting supplied results; invalid machine inputs and dates are rejected',()=>{
 const document={client:'Cliente',date:'',machines:[machine('GA90',90,16.482,10,270)],pressureBar:7,energyPrice:0.45,calculation:{specificPowerSum:999}};
 assert.ok(validateLeakage(document).calculation.specificPowerSum<1);
 for(const patch of [{flowM3min:0},{powerKw:NaN},{hoursPerDay:25},{daysPerYear:367},{name:''}])assert.throws(()=>validateLeakage({...document,machines:[{...document.machines[0],...patch}]}));
 assert.throws(()=>validateLeakage({...document,date:'2026-02-30'}));
 assert.throws(()=>validateLeakage({...document,machines:[document.machines[0],document.machines[0]]}));
});
test('direct annual hours bypass daily inputs and mix with legacy machines',()=>{
 const direct={...machine('Direto',60,10,24,365),hoursMode:'annual',annualHoursInput:4000};
 const doc={client:'Cliente',pressureBar:7,energyPrice:0.45,machines:[direct]};
 const saved=validateLeakage(doc);
 assert.equal(saved.calculation.annualHours,4000);assert.equal(saved.machines[0].hoursPerDay,null);
 const mixed=calculateMachines([direct,machine('Calculado',60,10,10,200,2)]);
 assert.equal(mixed.rows[0].annualHours,4000);assert.equal(mixed.rows[1].annualHours,2000);assert.equal(mixed.annualHours,3000);
 for(const annualHoursInput of [null,0,-1,8785,NaN,'4000'])assert.throws(()=>validateLeakage({...doc,machines:[{...direct,annualHoursInput}]}));
 assert.throws(()=>validateLeakage({...doc,machines:[{...direct,hoursMode:'invalid'}]}));
});
