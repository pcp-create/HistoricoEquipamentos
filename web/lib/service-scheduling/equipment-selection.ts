/** Returned operations can be corrected before they are dispatched again. */
export function equipmentSelectionLocked(operation:any):boolean{
 const returned=!operation.sent_at&&!!operation.document.checklistReturn&&['pending','planning','scheduled'].includes(operation.status);
 return !returned&&!!(operation.sent_at||operation.document.equipmentLocked||operation.document.checklistRun?.equipmentId);
}
