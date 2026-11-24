/** Only fields editable in the scheduling row determine whether it needs saving. */
const textFields = ['serviceType','description','internalNote','vehicleId','checklistId','equipmentId','responsible','date','time','calendarId'] as const;
export function operationLineValues(document:any) {
 const source=document||{};
 return {
  ...Object.fromEntries(textFields.map(key=>[key,source[key]??(key==='calendarId'?'standard':'')])),
  equipmentUnassigned:source.equipmentUnassigned===true,
  support:Array.isArray(source.support)?source.support:[],
  duration:source.duration==null?null:Number(source.duration),
 };
}
export function operationLineChanged(draft:any,original:any) {
 return JSON.stringify(operationLineValues(draft))!==JSON.stringify(operationLineValues(original));
}
export function operationDurationOnlyChanged(draft:any,original:any) {
 return operationLineChanged(draft,original)&&!operationLineChanged({...draft,duration:original?.duration},original);
}
/** Keep the latest server-owned report and metadata when saving edited row fields. */
export function mergeOperationLine(draft:any,original:any) {
 return {...original,...operationLineValues(draft),jobTitle:draft.responsible!==original?.responsible?(draft.jobTitle??original?.jobTitle):original?.jobTitle,
  ...((draft.checklistId||'')!==(original?.checklistId||'')?{checked:draft.checked}:{}),
  ...((draft.equipmentId||'')!==(original?.equipmentId||'')?{equipment:draft.equipment}:{}),
 };
}
