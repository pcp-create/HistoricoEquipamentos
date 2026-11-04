import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateResponsibleChange} from '../lib/service-scheduling/responsible-change';
test('changing a dispatched executor requires explicit confirmation and a replacement',()=>{
 const operation={sent_at:'2026-11-04',document:{responsible:'old@test.com'}};
 assert.throws(()=>validateResponsibleChange(operation,{responsible:'new@test.com'},undefined),/Confirme/);
 assert.throws(()=>validateResponsibleChange(operation,{responsible:''},true),/novo executante/);
 assert.equal(validateResponsibleChange(operation,{responsible:'new@test.com'},true),true);
 assert.equal(validateResponsibleChange(operation,{responsible:'old@test.com'},false),false);
 assert.equal(validateResponsibleChange({...operation,sent_at:null},{responsible:'new@test.com'},false),false);
});
