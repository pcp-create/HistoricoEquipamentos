import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {projectField}=createRequire(import.meta.url)('../public/field-offline/project.js');
test('offline support cannot project report changes or operation completion',()=>{
 for(const action of ['report_save','report_send','report_return','checklist_save','finish_full']){
  const detail={operation:{id:'op',document:{responsible:'tech',support:['helper']}}};
  assert.throws(()=>projectField({email:'helper'},detail,{action,offline:{capturedAt:new Date().toISOString()}}),/Somente o técnico responsável/);
  assert.equal(detail.operation.document.responsible,'tech');
 }
});
