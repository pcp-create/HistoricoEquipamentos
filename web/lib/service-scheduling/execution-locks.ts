import {reportSubmission} from './checklists';
export function operationFinished(operation:any){return ['awaiting_review','reviewed','completed'].includes(operation?.status);}
export function technicianTimeChangesLocked(operation:any){return operationFinished(operation)||!!reportSubmission(operation?.document?.checklistRun);}
