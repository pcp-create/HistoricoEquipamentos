import {test} from 'node:test';
import assert from 'node:assert/strict';
import {prepareChecklistSubmission} from '../lib/service-scheduling/checklist-store';
test('full submission validates saved drafts and submits all stages atomically',()=>{
 const run={template:{id:'t',name:'Checklist',stages:[{id:'s',name:'Inspeção',fields:[{id:'f',label:'Resultado',type:'text',required:true}]}]},stages:{s:{status:'released',answers:{f:''}}}};
 assert.throws(()=>prepareChecklistSubmission(run,'tech'));
 run.stages.s.answers.f='Conferido';
 const submitted=prepareChecklistSubmission(run,'tech');
 assert.equal(submitted.stages.s.status,'submitted');
 assert.equal(submitted.stages.s.submittedBy,'tech');
 assert.equal(run.stages.s.status,'released');
});

import {reportStatusLabel} from '../lib/service-scheduling/checklists';
test('report status distinguishes saved drafts, partial sends, full sends and returns',()=>{
 const run:any={stages:{}};
 assert.equal(reportStatusLabel(run),'Não preenchido');
 run.reportSavedAt='2026-01-01T08:00:00Z';
 assert.equal(reportStatusLabel(run),'Salvo');
 run.partialSubmission={at:'2026-01-01T09:00:00Z',by:'tech'};
 assert.equal(reportStatusLabel(run),'Enviado parcial');
 run.submission={at:'2026-01-01T10:00:00Z',by:'tech'};
 assert.equal(reportStatusLabel(run),'Enviado completo');
 delete run.submission;delete run.partialSubmission;delete run.reportSavedAt;
 run.reportReturnedAt='2026-01-01T11:00:00Z';
 assert.equal(reportStatusLabel(run),'Devolvido para edição');
});

import {validateAlertComments,validateFieldDetails} from '../lib/service-scheduling/checklists';
import {checklistReport} from '../lib/service-scheduling/checklist-report';
test('configured alerts require meaningful comments even when optional comments are disabled',()=>{
 const field={id:'f',label:'Condição',type:'flag2',required:false,alertOptions:['NOK'],comment:false};
 const stage={id:'s',name:'Inspeção',fields:[field]};
 const run={template:{id:'t',name:'Checklist',items:[],stages:[stage]},stages:{s:{status:'released',answers:{f:'NOK'},details:{f:{comment:'   '}}}}};
 assert.throws(()=>prepareChecklistSubmission(run,'tech'),/Informe um comentário.*Condição/);
 assert.throws(()=>validateAlertComments(stage,{f:'NOK'},{}),/comentário/);
 assert.doesNotThrow(()=>validateAlertComments(stage,{f:'OK'},{}));
 assert.doesNotThrow(()=>validateAlertComments({...stage,fields:[{...field,alertOptions:[]}]},{f:'NOK'},{}));
 run.stages.s.details.f.comment='Vazamento na conexão';
 assert.doesNotThrow(()=>validateFieldDetails(stage,run.stages.s.details));
 assert.doesNotThrow(()=>prepareChecklistSubmission(run,'tech'));
 assert.equal(checklistReport(run)[0].groups[0].fields[0].comment,'Vazamento na conexão');
});
