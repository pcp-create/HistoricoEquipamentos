import {test} from 'node:test';import assert from 'node:assert/strict';
import {reportDraftKey,readReportDraft,writeReportDraft,sameReportDraft,type ReportStageDraft} from '../lib/service-scheduling/report-draft';
test('drafts survive a storage reload and are isolated by user, operation, stage and checklist revision',()=>{
 const values=new Map<string,string>();const storage={getItem:(k:string)=>values.get(k)||null,setItem:(k:string,v:string)=>{values.set(k,v)},removeItem:(k:string)=>{values.delete(k)}};
 const base:ReportStageDraft={answers:{},details:{},equipmentId:'10',meterDate:'2026-11-05'},value={...base,answers:{a:'NOK',b:0},details:{a:{comment:'Substituir filtro',photos:['9']}}};
 const key=reportDraftKey('Tech@test.com','op1','stage1');writeReportDraft(storage,key,'template-v1',base,value);
 assert.deepEqual(readReportDraft(storage,key,'template-v1')?.value,value);assert.equal(readReportDraft(storage,key,'template-v2'),null);assert.equal(readReportDraft(storage,reportDraftKey('other@test.com','op1','stage1'),'template-v1'),null);assert.notEqual(key,reportDraftKey('tech@test.com','op2','stage1'));assert.notEqual(key,reportDraftKey('tech@test.com','op1','stage2'));
 writeReportDraft(storage,key,'template-v1',value,value);assert.equal(storage.getItem(key),null);
 assert.ok(sameReportDraft({...base,answers:{a:'',b:[],c:' '}},base));assert.ok(!sameReportDraft({...base,answers:{a:0}},base));
 storage.setItem(key,'broken json');assert.equal(readReportDraft(storage,key,'template-v1'),null);
 assert.throws(()=>writeReportDraft({...storage,setItem(){throw Error('quota')}},key,'template-v1',base,value),/quota/);
});
