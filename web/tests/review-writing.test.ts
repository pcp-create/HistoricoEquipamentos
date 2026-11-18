import {test} from 'node:test';
import assert from 'node:assert/strict';
import {writingFields,validateWritingSuggestions,reviewWritingSuggestions} from '../lib/service-scheduling/review-writing';
const run={template:{name:'Teste',stages:[{id:'s',name:'Inspeção',fields:[{id:'text',type:'textarea',label:'Diagnóstico'},{id:'empty',type:'text',label:'Vazio'},{id:'number',type:'number',label:'Pressão'},{id:'status',type:'flag',label:'Estado',options:['OK','NOK'],comment:true}]}]},stages:{s:{answers:{text:'foi verificado 7,5 bar no GA75',number:7.5,status:'NOK'},details:{status:{comment:'os filtro está sujo'}}}}};
test('only narrative values and configured comments are eligible; blank fields are never sent',()=>{
 const fields=writingFields(run);
 assert.deepEqual(fields.map(f=>[f.fieldId,f.key]),[['text','value'],['status','comment']]);
 assert(writingFields(run,true).some(f=>f.fieldId==='empty'));
});
test('corrections preserve original text and numbers; unchanged suggestions are omitted',()=>{
 const fields=writingFields(run);
 const result=validateWritingSuggestions(fields,{suggestions:[{id:fields[0].id,suggested:'Foi verificado 7,5 bar no GA75.'}]});
 assert.equal(result[0].text,run.stages.s.answers.text);
 assert.equal(result[0].suggested,'Foi verificado 7,5 bar no GA75.');
 assert.deepEqual(validateWritingSuggestions(fields,{suggestions:[{id:fields[0].id,suggested:fields[0].text}]}),[]);
});
test('reject changed measurements, identifiers, invented fields, duplicates and blank replacements',()=>{
 const fields=writingFields(run),id=fields[0].id;
 for(const suggested of ['Foi verificado 8 bar no GA75.','Foi verificado 7,5 bar no GA90.','Foi verificado no GA75.',''])assert.throws(()=>validateWritingSuggestions(fields,{suggestions:[{id,suggested}]}));
 assert.throws(()=>validateWritingSuggestions(fields,{suggestions:[{id:'invented',suggested:'Novo diagnóstico.'}]}));
 assert.throws(()=>validateWritingSuggestions(fields,{suggestions:[{id,suggested:fields[0].text},{id,suggested:fields[0].text}]}));
});

test('an unsafe measurement is isolated while safe suggestions remain available',()=>{
 const fields=writingFields(run);
 const result=reviewWritingSuggestions(fields,{suggestions:[{id:fields[0].id,suggested:'Foi verificado 8 bar no GA75.'},{id:fields[1].id,suggested:'Os filtros estão sujos.'}]});
 assert.deepEqual(result.rejected,[{id:fields[0].id,label:fields[0].label}]);
 assert.equal(result.suggestions.length,1);
 assert.equal(result.suggestions[0].text,'os filtro está sujo');
 assert.equal(run.stages.s.answers.text,'foi verificado 7,5 bar no GA75');
});
test('invalid and ambiguous IDs still reject the entire review; empty valid output is allowed',()=>{
 const fields=writingFields(run),item={id:fields[0].id,suggested:'Texto inválido.'};
 for(const payload of [null,{}, {suggestions:[null]}, {suggestions:[{...item,id:'invented'}]}, {suggestions:[item,item]}])assert.throws(()=>reviewWritingSuggestions(fields,payload));
 assert.deepEqual(reviewWritingSuggestions(fields,{suggestions:[]}),{suggestions:[],rejected:[]});
 const result=reviewWritingSuggestions(fields,{suggestions:[{...item,suggested:''}]});
 assert.equal(result.rejected.length,1);
 assert.deepEqual(result.suggestions,[]);
});
