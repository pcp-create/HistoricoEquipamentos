import {test} from 'node:test';
import assert from 'node:assert/strict';
import {filterScheduleDateView} from '../lib/service-scheduling/date-view';
const operations=[
 {id:'oct',date:'2026-10-10',status:'scheduled',time:'08:00',responsibleEmail:'ana'},
 {id:'nov',date:'2026-11-02',status:'scheduled',time:'08:00',responsibleEmail:'bruno'},
 {id:'cross',date:'2026-09-30',dates:['2026-09-30','2026-10-01'],status:'executing',responsibleEmail:'bruno',support:['ana']},
 {id:'none',date:'',status:'pending',responsibleEmail:'ana'},
];
const schedule={expected_delivery_date:'2026-09-20',programming_status:'scheduled',calendar_operations:operations,operation_count:4};
test('delivery remains accumulated while scheduled view selects actual operations and counts in the month',()=>{
 assert.equal(filterScheduleDateView(schedule,'delivery','2026-10').calendar_operations.length,4);
 const result=filterScheduleDateView(schedule,'operation','2026-10');
 assert.deepEqual(result.calendar_operations.map((o:any)=>o.id),['oct','cross']);
 assert.equal(result.operation_count,2);assert.deepEqual(result.operation_status_counts,{scheduled:1,executing:1});
 assert.equal(filterScheduleDateView(schedule,'operation','2026-12'),null);
 assert.equal(schedule.calendar_operations.length,4);
});
test('operation date is independent of delivery and intersects executor on the same operation',()=>{
 const future={...schedule,expected_delivery_date:'2027-01-01'};
 assert.equal(filterScheduleDateView(future,'delivery','2026-10'),null);
 assert.equal(filterScheduleDateView(future,'operation','2026-10').operation_count,2);
 assert.equal(filterScheduleDateView(schedule,'operation','2026-11','ana'),null);
 assert.deepEqual(filterScheduleDateView(schedule,'operation','2026-10','ana').calendar_operations.map((o:any)=>o.id),['oct','cross']);
 assert.equal(filterScheduleDateView(schedule,'operation','').operation_count,4);
 assert.equal(filterScheduleDateView({...schedule,calendar_operations:[]},'operation','2026-10'),null);
});
