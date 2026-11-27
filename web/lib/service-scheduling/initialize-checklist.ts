import {stagesOf} from './checklists';
/** Initialize only missing reports; existing responses and template snapshots are preserved. */
export function initializeChecklist(document:any, templates:any[], actor:string, at=new Date().toISOString()) {
 if(!document.checklistId||document.checklistRun)return document;
 const template=templates.find(t=>t.id===document.checklistId);
 if(!template)throw Error('Checklist não encontrado.');
 return {...document,checklistRun:{template:structuredClone(template),equipmentId:'',meterDate:'',stages:Object.fromEntries(stagesOf(template).map(stage=>[stage.id,{status:'released',answers:{},releasedAt:at,releasedBy:actor}]))}};
}
