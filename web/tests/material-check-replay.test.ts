import {test} from 'node:test';
import assert from 'node:assert/strict';
import {materialCheckReplay} from '../lib/service-scheduling/material-check-replay';
const item=(id:number,withdrawn:any=null)=>({item_company:1,item_order:'100',id_m8:String(id),withdrawn});
test('offline material replay tolerates added lines without assigning quantities and ignores removed lines without movements',()=>{
 const result=materialCheckReplay([item(1),item(2)],[item(1,2),item(3,0)],true);
 assert.deepEqual(result.added,['1:100:2']);assert.deepEqual(result.removed,['1:100:3']);
 assert.equal(result.patches.get('1:100:1').withdrawn,2);assert.equal(result.patches.has('1:100:2'),false);
 assert.throws(()=>materialCheckReplay([item(1)],[item(3,2)],true),/Preserve a pendência/);
 assert.throws(()=>materialCheckReplay([item(1)],[{...item(3),returned:1}],true),/Preserve a pendência/);
 assert.throws(()=>materialCheckReplay([item(1),item(2)],[item(1)],false),/lista de peças mudou/);
 assert.throws(()=>materialCheckReplay([item(1)],[item(1),item(1)],true),/lista de peças mudou/);
});
