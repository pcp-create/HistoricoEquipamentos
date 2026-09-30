import {test} from 'node:test';
import assert from 'node:assert/strict';
import {technicalReport} from '../lib/service-scheduling/technical-report';
test('technical report shares numbered sections, excludes private answers and totals only the selected operation',()=>{
 const operation={id:'one',document:{responsible:'tech',description:'Inspeção',checklistRun:{template:{name:'Teste',prefix:'CCP',stages:[{id:'s',name:'01. Medições',fields:[{id:'public',label:'Horímetro',type:'number'},{id:'private',label:'Interno',type:'text',report:false}]}]},submission:{at:'2026-09-30T12:00:00Z',by:'tech'},stages:{s:{status:'submitted',answers:{public:2000,private:'Segredo'}}}}}};
 const result=technicalReport(operation,{cliente_nome:'Cliente'},[{email:'tech',display_name:'Técnico'}],[{id:'session',operation_id:'one',actor:'tech',kind:'work',state:'finished',active_seconds:3600,pause_seconds:300,started_at:'2026-09-30T10:00:00Z',finished_at:'2026-09-30T11:05:00Z',correction:{active_seconds:1800,pause_seconds:120}},{id:'other',operation_id:'two',actor:'outsider',kind:'work',state:'finished',active_seconds:99999,pause_seconds:0}],[],[]);
 assert.deepEqual(result.map(s=>s.number),['01','02','03','04','05','06']);
 assert.equal(result[5].name,'Medições');
 assert.equal(result[4].name,'APONTAMENTOS');
 assert.equal(result[4].groups[0].fields[0].label,'30/09/2026, 07:00');
 assert.equal(result[4].groups[0].fields[0].value,'Início de atividade');
 assert.equal(result[4].groups[0].fields[0].responsible,'Técnico');
 assert.equal(result[4].groups[0].fields[1].responsible,'Técnico');
 const json=JSON.stringify(result);
 assert.ok(!json.includes('Segredo'));assert.ok(!json.includes('outsider'));
 const totals=result[4].groups.find(g=>g.name.includes('Técnico'))!;
 assert.equal(totals.fields[0].value,'00:30:00');
 assert.equal(totals.fields[2].value,'00:02:00');
 assert.equal(result[0].groups[0].fields[1].value,'30/09/2026, 09:00');
});
test('only complete exports disclose pause events, duration and pause-inclusive total',()=>{
 const operation={id:'one',document:{responsible:'tech',checklistRun:{template:{stages:[]},stages:{}}}};
 const sessions=[{id:'session',operation_id:'one',actor:'tech',kind:'work',state:'finished',active_seconds:1800,pause_seconds:120,started_at:'2026-09-30T10:00:00Z',finished_at:'2026-09-30T10:32:00Z',correction:{active_seconds:1800,pause_seconds:120,pauses:[{start:'2026-09-30T10:10:00Z',end:'2026-09-30T10:12:00Z'}]}}];
 for(const mode of ['complete','summary','budget'] as const){
  const report=technicalReport(operation,{},[],sessions,[],[],mode);
  const json=JSON.stringify(report);
  assert.equal(json.includes('Início de pausa'),mode==='complete');
  assert.equal(json.includes('Tempo de paradas'),mode==='complete');
  const total=report.find(s=>s.id==='events')!.groups.flatMap(g=>g.fields).find(f=>f.label==='Tempo total');
  assert.equal(total?.value,mode==='complete'?'00:32:00':'00:30:00');
 }
});
