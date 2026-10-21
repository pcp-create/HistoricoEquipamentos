import {test} from 'node:test';
import assert from 'node:assert/strict';
import {writingFields,validateWritingSuggestions} from '../lib/service-scheduling/review-writing';
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
