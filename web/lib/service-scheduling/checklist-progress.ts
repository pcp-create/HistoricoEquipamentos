import type {ChecklistField} from './checklists';
export function checklistProgress(fields: ChecklistField[], answers: Record<string, unknown>) {
 const filled=(f:ChecklistField)=>isChecklistAnswerFilled(answers[f.id]);
 if(fields.some(f=>f.required&&!filled(f)))return 'required';
 const count=fields.filter(filled).length;
 if(fields.length&&count===fields.length)return 'complete';
 return count?'partial':'empty';
}
export const progressLabels={required:'Vermelho: há campo obrigatório não preenchido',complete:'Verde: preenchimento completo',partial:'Amarelo: preenchimento parcial',empty:'Cinza: campos opcionais não preenchidos'};

export function isChecklistAnswerFilled(value:unknown){
 return Array.isArray(value)?value.length>0:value!==null&&value!==undefined&&String(value).trim()!=='';
}
export function checklistCounts(fields:ChecklistField[],answers:Record<string,unknown>){
 return {filled:fields.filter(f=>isChecklistAnswerFilled(answers[f.id])).length,total:fields.length};
}
