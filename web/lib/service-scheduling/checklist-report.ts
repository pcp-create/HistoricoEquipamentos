import {stagesOf,groupsOf} from './checklists';
/** Explicit allow-list: internal notes and excluded fields never enter the report model. */
export function checklistReport(run:any){
 return stagesOf(run.template).map(stage=>({id:stage.id,name:stage.name,status:run.stages[stage.id]?.status||'pending',groups:groupsOf(stage).map(group=>({name:group.name,fields:group.fields.filter(f=>f.report!==false).map(f=>{
  const value=run.stages[stage.id]?.answers?.[f.id];const d=run.stages[stage.id]?.details?.[f.id]||{};
  return {id:f.id,label:f.label,type:f.type,value:['photo','signature'].includes(f.type)?null:value??null,photos:[...(['photo','signature'].includes(f.type)?value||[]:[]),...(d.photos||[])],comment:f.comment?d.comment||'':''};
 })})).filter(g=>g.fields.length)})).filter(s=>s.groups.length);
}
