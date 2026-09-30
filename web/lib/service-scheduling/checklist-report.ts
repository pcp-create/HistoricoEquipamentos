import {stagesOf,groupsOf,fieldOptions} from './checklists';
export type ReportField = { id:string; label:string; type:string; value:any; photos:string[]; comment:string; options?:string[]; responsible?:string };
export type ReportStage = { id:string; name:string; status:string; groups:{name:string;fields:ReportField[]}[] };
export type ReportMode = "complete" | "summary" | "budget";
/** Internal notes are included only in the explicitly requested budget export. */
export function checklistReport(run:any, mode:ReportMode="complete"):ReportStage[]{
 return stagesOf(run.template).map(stage=>({id:stage.id,name:stage.name,status:run.stages[stage.id]?.status||'pending',groups:groupsOf(stage).map(group=>({name:group.name,fields:group.fields.filter(f=>f.report!==false || (mode==='budget' && f.internalNote)).map(f=>{
  const value=run.stages[stage.id]?.answers?.[f.id];const d=run.stages[stage.id]?.details?.[f.id]||{};
  return {...(['flag','select'].includes(f.type)?{options:fieldOptions(f)}:{}),id:f.id,label:f.label,type:f.type,value:['photo','signature'].includes(f.type)?null:value??null,photos:[...(['photo','signature'].includes(f.type)?value||[]:[]),...(d.photos||[])],comment:[f.comment?d.comment||'':'',mode==='budget'&&f.internalNote&&d.internalNote?.trim()?'Observação interna: '+d.internalNote:''].filter(Boolean).join('\n\n')};
 })})).filter(g=>g.fields.length)})).filter(s=>s.groups.length);
}

/** Shared display formatting for the review screen and PDF. */
export function reportFieldValue(field: { value: any; type: string; photos: any[] }): string {
 const value=field.value;
 if(value===null || value===undefined || value==='') return field.photos.length ? (field.type==='signature'?'Assinatura registrada':'Fotos anexadas') : 'Não preenchido';
 if(typeof value==='number') return value.toLocaleString('pt-BR');
 if(typeof value==='boolean') return value?'Sim':'Não';
 if(field.type==='date' && /^\d{4}-\d{2}-\d{2}$/.test(String(value))) return String(value).split('-').reverse().join('/');
 return Array.isArray(value)?value.join(', '):String(value);
}

export function filterReport<T extends ReturnType<typeof checklistReport>[number]>(report:T[],mode:ReportMode):T[]{
 if(mode==='complete')return report;
 return report.map(stage=>({...stage,groups:stage.groups.map(group=>({...group,fields:group.fields.filter(field=>{
  const value=field.value;
  const filled=Array.isArray(value)?value.some(v=>String(v).trim()):typeof value==='string'?!!value.trim()&&value!=='Não informado':value!==null&&value!==undefined;
  return filled||field.photos.length>0||!!field.comment.trim();
 })})).filter(group=>group.fields.length)})).filter(stage=>stage.groups.length);
}
