import {test} from 'node:test';
import assert from 'node:assert/strict';
import {checklistReport,filterReport} from '../lib/service-scheduling/checklist-report';
const run={template:{stages:[{id:'s',name:'Etapa',fields:[
 {id:'empty',label:'Vazio',type:'text'}, {id:'zero',label:'Zero',type:'number'},
 {id:'no',label:'Não',type:'boolean'}, {id:'note',label:'Nota',type:'text',internalNote:true},
 {id:'hidden',label:'Oculto',type:'text',report:false},
]}]},stages:{s:{answers:{empty:'  ',zero:0,no:false,hidden:'privado'},details:{note:{internalNote:'Reparar válvula'}}}}};
test('complete and summary exports never include internal notes or excluded answers',()=>{
 for(const mode of ['complete','summary'] as const){
  const report=filterReport(checklistReport(run,mode),mode);
  assert.ok(!JSON.stringify(report).includes('Reparar válvula'));
  assert.ok(!JSON.stringify(report).includes('privado'));
  if(mode==='summary')assert.deepEqual(report[0].groups[0].fields.map(f=>f.id),['zero','no']);
 }
});
test('budget keeps internal-note-only fields and omits empty groups',()=>{
 const report=filterReport(checklistReport(run,'budget'),'budget');
 assert.deepEqual(report[0].groups[0].fields.map(f=>f.id),['zero','no','note']);
 assert.match(report[0].groups[0].fields[2].comment,/Observação interna: Reparar válvula/);
 assert.deepEqual(filterReport(checklistReport({...run,stages:{}},'summary'),'summary'),[]);
});
test('verification options preserve configured labels, selection and legacy defaults',()=>{
 const report=checklistReport({template:{stages:[{id:'s',name:'Inspeções',fields:[{id:'flag',label:'Filtro',type:'flag',options:['Sim','Não','N/A']},{id:'old',label:'Legado',type:'flag'}]}]},stages:{s:{answers:{flag:'Não',old:'OK'}}}});
 const fields=report[0].groups[0].fields;
 assert.deepEqual(fields[0].options,['Sim','Não','N/A']);
 assert.equal(fields[0].value,'Não');
 assert.deepEqual(fields[1].options,['OK','NOK','NA']);
});
