import {test} from 'node:test';
import assert from 'node:assert/strict';
import {latestOpenProgramming,latestProgrammingStatus} from '../lib/service-scheduling/latest-programming';
test('latest scheduled date excludes finished and reviewed operations with deterministic time ordering',()=>{
 const operations=[
 {id:'old',date:'2026-10-10',time:'08:00',status:'executing'},
 {id:'latest',date:'2026-10-15',time:'09:00',status:'pending',responsibleEmail:'tech@test'},
 {id:'early',date:'2026-10-15',time:'07:30',status:'scheduled'},
 {id:'done',date:'2026-10-20',status:'completed'},
 {id:'reviewed',date:'2026-10-21',status:'reviewed'},
 {id:'undated',date:'',status:'pending'}];
 assert.equal(latestOpenProgramming(operations)?.id,'latest');
 assert.equal(latestOpenProgramming([...operations].reverse())?.id,'latest');
 assert.equal(latestProgrammingStatus(latestOpenProgramming(operations)),'scheduled');
 assert.equal(operations[0].id,'old');
 assert.equal(latestOpenProgramming(operations.slice(3)),undefined);
});
