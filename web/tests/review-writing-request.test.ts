import {test} from 'node:test';
import assert from 'node:assert/strict';
import {writingReviewRequest} from '../lib/service-scheduling/review-writing-request';
import {reviewWritingSuggestions,type WritingField} from '../lib/service-scheduling/review-writing';
const fields:WritingField[]=[{id:JSON.stringify(['stage','field','value']),stageId:'stage',fieldId:'field',key:'value',label:'Como resolvi',text:'trocado filtro 123'}];
test('strict schema uses safe IDs and restores internal paths before validating suggestions',()=>{
 const request=writingReviewRequest(fields,'gpt-4o-mini');
 assert.deepEqual(request.body.text.format.schema.properties.suggestions.items.properties.id.enum,['field_1']);
 assert.equal(JSON.parse(request.body.input)[0].id,'field_1');
 const restored=request.restore({suggestions:[{id:'field_1',suggested:'Substituído o filtro 123.'}]});
 assert.equal(reviewWritingSuggestions(fields,restored).suggestions[0].id,fields[0].id);
 assert.equal(reviewWritingSuggestions(fields,request.restore({suggestions:[{id:'field_1',suggested:'Substituído o filtro 456.'}]})).rejected.length,1);
 assert.throws(()=>request.restore({suggestions:[{id:fields[0].id,suggested:'texto'}]}));
 assert.throws(()=>reviewWritingSuggestions(fields,request.restore({suggestions:[{id:'field_1',suggested:'texto'},{id:'field_1',suggested:'texto'}]})));
});
