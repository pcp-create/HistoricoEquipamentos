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
