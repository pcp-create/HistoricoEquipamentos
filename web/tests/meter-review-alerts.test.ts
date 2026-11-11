import {test} from 'node:test';import assert from 'node:assert/strict';
import {meterReviewAlerts} from '../lib/service-scheduling/meter-review-alerts';
test('only valid total-meter values below the latest collection are flagged',()=>{
 const run:any={template:{items:[],stages:[{id:'s',groups:[{fields:[{id:'total',label:'Horímetro Total',type:'meter'},{id:'load',label:'Horas em carga',type:'number'}]}]}]},stages:{s:{answers:{total:12028,load:0}}}};
 const alerts=meterReviewAlerts(run,79399);assert.equal(alerts.length,1);assert.equal(alerts[0].fieldId,'total');assert.match(alerts[0].message,/79.399/);
 for(const value of [79399,80000,null,undefined,'',NaN]){run.stages.s.answers.total=value;assert.deepEqual(meterReviewAlerts(run,79399),[]);}
 assert.deepEqual(meterReviewAlerts(undefined,79399),[]);
 assert.deepEqual(meterReviewAlerts(run,null),[]);
});
