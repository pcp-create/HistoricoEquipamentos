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

test('NOK remains red until its own mandatory comment and photo are present',()=>{
 const fields:any=[{id:'fan',label:'Ventilador e resfriador',type:'flag',required:true,alertOptions:['NOK']}];
 const answers={fan:'NOK'};
 assert.equal(checklistProgress(fields,answers),'required');
 assert.equal(checklistProgress(fields,answers,{fan:{comment:'Está travado'}}),'required');
 assert.equal(checklistProgress(fields,answers,{fan:{photos:['568']}}),'required');
 assert.equal(checklistProgress(fields,answers,{fan:{comment:'Está travado'},maintenance:{photos:['568']}}),'required');
 assert.equal(checklistProgress(fields,answers,{fan:{comment:'Está travado',photos:['568']}}),'complete');
 assert.equal(checklistProgress(fields,{fan:'OK'}),'complete');
 assert.equal(checklistProgress(fields,{fan:'NA'}),'complete');
});
test('configured alerts require comments without inventing a photo requirement; optional NOK still requires evidence',()=>{
 const fields:any=[{id:'status',label:'Status',type:'flag4',required:false,alertOptions:['Operando com falha']}];
 assert.equal(checklistProgress(fields,{status:'Operando com falha'}),'required');
 assert.equal(checklistProgress(fields,{status:'Operando com falha'},{status:{comment:'Vazamento'}}),'complete');
 assert.equal(checklistProgress([{id:'f',label:'Condição',type:'flag2',required:false}] as any,{f:'NOK'},{f:{comment:'Trocar peça'}}),'required');
 assert.equal(checklistProgress([{id:'f',label:'Condição',type:'flag2',required:false}] as any,{f:'NOK'},{f:{comment:'Trocar peça',photos:['1']}}),'complete');
});
