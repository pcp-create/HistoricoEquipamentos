import {stagesOf,hasAlertComment} from './checklists';
export type WritingField={id:string;stageId:string;fieldId:string;key:'value'|'comment'|'internalNote';label:string;text:string};
export type WritingSuggestion=WritingField & {suggested:string};
export function writingFields(run:any,includeEmpty=false):WritingField[]{
 if(!run?.template)return [];
 const result:WritingField[]=[];
 for(const stage of stagesOf(run.template))for(const field of stage.fields){
  const values=run.stages?.[stage.id];
  for(const key of ['value','comment','internalNote'] as const){
   if(key==='value'&&!['text','textarea'].includes(field.type))continue;
   if(key==='comment'&&!field.comment&&!hasAlertComment(field))continue;
   if(key==='internalNote'&&!field.internalNote)continue;
   const text=key==='value'?values?.answers?.[field.id]:values?.details?.[field.id]?.[key];
   if(!includeEmpty&&(typeof text!=='string'||!text.trim()))continue;
   result.push({id:JSON.stringify([stage.id,field.id,key]),stageId:stage.id,fieldId:field.id,key,label:`${stage.name} · ${field.label}${key==='comment'?' · Comentário':key==='internalNote'?' · Observação interna':''}`,text:typeof text==='string'?text:''});
  }
 }
 return result;
}
// Reject changes to numbers and mixed letter/number identifiers before human review.
const facts=(text:string)=>(text.match(/\b[\p{L}\d]*\d[\p{L}\d]*(?:[.,:/-][\p{L}\d]+)*\b/gu)||[]).sort();
export function validateWritingSuggestions(fields:WritingField[],payload:any):WritingSuggestion[]{
 if(!Array.isArray(payload?.suggestions)||payload.suggestions.length>fields.length)throw Error('Resposta de IA inválida.');
 const seen=new Set<string>();
 return payload.suggestions.map((item:any)=>{
  const field=fields.find(f=>f.id===item.id);
  if(!field||seen.has(item.id)||typeof item.suggested!=='string'||!item.suggested.trim()||item.suggested.length>10000)throw Error('Resposta de IA inválida.');
  seen.add(item.id);
  if(JSON.stringify(facts(field.text))!==JSON.stringify(facts(item.suggested)))throw Error('A sugestão alterou números ou identificadores técnicos e foi descartada. Tente novamente.');
  return {...field,suggested:item.suggested.trim()};
 }).filter((s:WritingSuggestion)=>s.text!==s.suggested);
}

// Isolate unsafe suggestions: one changed measurement must not discard other fields.
// Invalid envelopes and ambiguous/unknown IDs still invalidate the entire response.
export function reviewWritingSuggestions(fields:WritingField[],payload:any){
 if(!Array.isArray(payload?.suggestions)||payload.suggestions.length>fields.length)throw Error('Resposta de IA inválida.');
 const seen=new Set<string>();
 const suggestions:WritingSuggestion[]=[],rejected:{id:string;label:string}[]=[];
 for(const item of payload.suggestions){
  const field=fields.find(f=>f.id===item?.id);
  if(!field||seen.has(field.id))throw Error('Resposta de IA inválida.');
  seen.add(field.id);
  try{suggestions.push(...validateWritingSuggestions([field],{suggestions:[item]}));}
  catch{rejected.push({id:field.id,label:field.label});}
 }
 return {suggestions,rejected};
}
