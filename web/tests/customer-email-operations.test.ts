import {test} from 'node:test';
import assert from 'node:assert/strict';
import {selectEmailOperations} from '../lib/service-scheduling/customer-email-operations';
test('email selection includes only selected reviewed operations belonging to the OS',()=>{
 const a='00000000-0000-4000-8000-000000000001',b='00000000-0000-4000-8000-000000000002',c='00000000-0000-4000-8000-000000000003';
 const operations=[{id:a,status:'reviewed',document:{checklistRun:{}}},{id:b,status:'awaiting_review',document:{checklistRun:{}}},{id:c,status:'completed',document:{}}];
 assert.deepEqual(selectEmailOperations(operations,[a]),[operations[0]]);
 for(const selection of [undefined,[],[a,a],['invalid'],['00000000-0000-4000-8000-000000000004'],[a,b],[c]])assert.throws(()=>selectEmailOperations(operations,selection));
});
