import {reportSubmission} from "./checklists";
export function operationFinished(operation:any){return ['awaiting_review','reviewed','completed'].includes(operation?.status);}
export function technicianTimeChangesLocked(operation:any,actor?:string){return operationFinished(operation)||!!(actor&&operation?.document?.technicianClosures?.[actor]);}
export function pendingTechnicianClosures(document:any):string[]{
 if(!document?.requireTechnicianClosure)return [];
 return [...new Set<string>([document.responsible,...(document.support||[])].filter(Boolean))].filter(email=>!document.technicianClosures?.[email]);
}

/** Recheck the current team after planning edits; personal closures stay intact. */
export function readyForReviewAfterClosures(operation:any,hasActiveSessions:boolean):boolean {
 const document=operation?.document;
 return operation?.status==='executing' && !!document?.requireTechnicianClosure &&
  !!document.responsible && !!document.technicianClosures?.[document.responsible] &&
  pendingTechnicianClosures(document).length===0 && !hasActiveSessions &&
  (!document.checklistId || !!reportSubmission(document.checklistRun));
}
