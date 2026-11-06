import {test} from 'node:test';
import assert from 'node:assert/strict';
import {calculateLeakResults,leakageM3PerHour} from '../public/tools/leak-results.mjs';
const device={annualHours:3497,specificPower:.344,energyPrice:.3,cost:712.879};
const close=(a:number|null,b:number)=>{assert.notEqual(a,null);assert.ok(Math.abs(a!-b)<1e-8,`${a} ≠ ${b}`);};
test('device preserves recorded cost and uses XML hours and PE for other annual results',()=>{
 const result=calculateLeakResults({flow:32.922,unit:'ltr/min',device});
 close(result.volumeAno,32.922*.06*3497);
 close(result.energy,result.volumeAno!*.344);
 close(result.co2,result.energy!*.527/1000);
 assert.equal(result.cost,712.879);
});
test('system recalculates all annual results and preserves detector references',()=>{
 const result=calculateLeakResults({flow:10,unit:'ltr/min',device,source:'system',system:{annualHours:2000,specificPower:.2,energyPrice:.5}});
 assert.equal(result.volumeAno,1200);assert.equal(result.energy,240);assert.equal(result.cost,120);close(result.co2,.12648);
 assert.equal(result.device.cost,device.cost);close(result.device.volumeAno,10*.06*3497);
});
test('missing detector parameters stay unknown; system needs valid parameters and recognized flow units',()=>{
 assert.deepEqual(calculateLeakResults({flow:10,device:{}}).device,{volumeAno:null,energy:null,cost:null,co2:null});
 assert.equal(calculateLeakResults({flow:0,device:{...device,cost:0}}).cost,0);
 for(const system of [null,{}, {annualHours:2000,specificPower:.2,energyPrice:0}])assert.throws(()=>calculateLeakResults({flow:10,device,source:'system',system}));
 assert.equal(leakageM3PerHour(1,'m³/min'),60);assert.equal(leakageM3PerHour(1,'Nm³/h'),1);
 assert.throws(()=>calculateLeakResults({flow:10,unit:'unknown',device,source:'system',system:{annualHours:2000,specificPower:.2,energyPrice:.5}}));
});
