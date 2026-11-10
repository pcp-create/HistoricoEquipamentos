export function operationFinished(operation:any){return ['awaiting_review','reviewed','completed'].includes(operation?.status);}
export function technicianTimeChangesLocked(operation:any,actor?:string){return operationFinished(operation)||!!(actor&&operation?.document?.technicianClosures?.[actor]);}
export function pendingTechnicianClosures(document:any):string[]{
 if(!document?.requireTechnicianClosure)return [];
 return [...new Set<string>([document.responsible,...(document.support||[])].filter(Boolean))].filter(email=>!document.technicianClosures?.[email]);
}
