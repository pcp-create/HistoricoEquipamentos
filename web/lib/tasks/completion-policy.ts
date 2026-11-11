export function operationTask(task:{source_key?:string}){return !!task.source_key?.startsWith('manual:schedule-operation:');}
export function manuallyCompletableTask(task:{source_key?:string}){return !!task.source_key?.startsWith('manual:')&&!operationTask(task);}
