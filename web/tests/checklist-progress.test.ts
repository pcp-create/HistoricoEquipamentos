import {test} from 'node:test';
import assert from 'node:assert/strict';
import {checklistProgress} from '../lib/service-scheduling/checklist-progress';
test('checklist lights prioritize missing required fields and accept zero and attachments',()=>{
 const fields:any=[{id:'meter',required:true},{id:'photo',required:false}];
 assert.equal(checklistProgress(fields,{}),'required');
 assert.equal(checklistProgress(fields,{photo:['file']}),'required');
 assert.equal(checklistProgress(fields,{meter:0}),'partial');
 assert.equal(checklistProgress(fields,{meter:0,photo:['file']}),'complete');
 assert.equal(checklistProgress([{id:'text',required:false}] as any,{text:'  '}),'empty');
});
