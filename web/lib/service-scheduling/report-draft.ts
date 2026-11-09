export type ReportStageDraft={answers:Record<string,any>;details:Record<string,any>;equipmentId:string;meterDate:string};
export type StoredReportDraft={schema:1;context:string;base:ReportStageDraft;value:ReportStageDraft;updatedAt:string};
const ordered=(v:any):any=>Array.isArray(v)?v.map(ordered):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,ordered(k==='answers'&&v[k]&&typeof v[k]==='object'?Object.fromEntries(Object.entries(v[k]).filter(([,a])=>a!=null&&!(typeof a==='string'&&!a.trim())&&!(Array.isArray(a)&&!a.length))):v[k])])):v;
export const reportDraftSignature=(v:unknown)=>JSON.stringify(ordered(v));
export const sameReportDraft=(a:unknown,b:unknown)=>reportDraftSignature(a)===reportDraftSignature(b);
export function reportDraftKey(email:string,operation:string,stage:string){return 'rj-report-draft-v1:'+JSON.stringify([email.trim().toLowerCase(),operation,stage]);}
const object=(v:any)=>v&&typeof v==='object'&&!Array.isArray(v);
const valid=(v:any):v is ReportStageDraft=>object(v)&&object(v.answers)&&object(v.details)&&typeof v.equipmentId==='string'&&typeof v.meterDate==='string';
export function readReportDraft(storage:Pick<Storage,'getItem'>,key:string,context:string):StoredReportDraft|null{
 const raw=storage.getItem(key);if(!raw)return null;
 try{const draft=JSON.parse(raw);return draft.schema===1&&draft.context===context&&valid(draft.base)&&valid(draft.value)?draft:null;}catch{return null;}
}
export function writeReportDraft(storage:Pick<Storage,'setItem'|'removeItem'>,key:string,context:string,base:ReportStageDraft,value:ReportStageDraft){
 if(sameReportDraft(base,value))storage.removeItem(key);
 else storage.setItem(key,JSON.stringify({schema:1,context,base,value,updatedAt:new Date().toISOString()} satisfies StoredReportDraft));
}

// Reapply only locally edited values, retaining unrelated updates from the server.
export function recoverReportDraft(base:ReportStageDraft,local:ReportStageDraft,server:ReportStageDraft):ReportStageDraft{
 const merge=(before:any,phone:any,remote:any):any=>{
  if(sameReportDraft(before,phone))return remote;
  if(object(before)&&object(phone)&&object(remote)){
   const result:any={};
   for(const key of new Set([...Object.keys(before),...Object.keys(phone),...Object.keys(remote)])){
    const value=merge(before[key],phone[key],remote[key]);if(value!==undefined)result[key]=value;
   }
   return result;
  }
  return phone;
 };
 return merge(base,local,server);
}
