import {alertKey,checklistAlertSignature,checklistAlerts,pendingChecklistAlerts,type ChecklistAlert} from './checklist-alerts';

/** Snapshot identity changes whenever an operation is added, removed, edited or reopened. */
export function orderReviewSignature(operations:any[]):string {
 return JSON.stringify(operations.map(o=>[String(o.id),Number(o.version),o.status]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))));
}
export function orderChecklistAlerts(operations:any[]):ChecklistAlert[]{
 return operations.flatMap(o=>checklistAlerts(o.document?.checklistRun).map(a=>({...a,operationId:String(o.id),operationPosition:Number(o.position)})));
}
export function orderAlertDocument(operations:any[],receipt?:any){
 const tasks=new Map<string,any>();
 for(const o of operations)for(const task of o.document?.checklistAlertTasks||[]){
  const previous=tasks.get(String(task.taskId));
  const ownAlerts=task.alerts|| (task.signature===checklistAlertSignature(checklistAlerts(o.document?.checklistRun))?checklistAlerts(o.document?.checklistRun):[]);
  const alerts=ownAlerts.map((a:any)=>({...a,operationId:String(o.id),operationPosition:Number(o.position)}));
  tasks.set(String(task.taskId),{...task,signature:undefined,alerts:[...(previous?.alerts||[]),...alerts]});
 }
 for(const task of receipt?.checklistAlertTasks||[]){
  const previous=tasks.get(String(task.taskId));
  tasks.set(String(task.taskId),{...task,signature:undefined,alerts:[...(previous?.alerts||[]),...(task.alerts||[])]});
 }
 return {checklistAlertTasks:[...tasks.values()].map(task=>({...task,alerts:[...new Map(task.alerts.map((a:ChecklistAlert)=>[alertKey(a),a])).values()]}))};
}
export function orderReviewBlockReason(operations:any[],receipt:any):string {
 if(!operations.length)return 'A OS não possui operações para revisar.';
 const pending=operations.filter(o=>!['reviewed','completed'].includes(o.status));
 if(pending.length)return `Conclua a revisão das ${pending.length} operação(ões) pendente(s).`;
 const alerts=orderChecklistAlerts(operations);
 const remaining=pendingChecklistAlerts(orderAlertDocument(operations,receipt),alerts).length;
 if(remaining)return `Trate os ${remaining} alerta(s) na aba Alertas da OS antes de concluir a revisão da OS.`;
 if(receipt?.signature!==orderReviewSignature(operations))return 'Conclua a revisão da OS para liberar a exportação do relatório.';
 return '';
}
/** The immutable audit receipt is the order-level review record (no operation owns it). */
export async function readOrderReview(db:any,scheduleId:string){
 return (await db.query("SELECT details FROM web_access_events WHERE event='service_order_reviewed' AND details->>'scheduleId'=$1 ORDER BY id DESC LIMIT 1",[String(scheduleId)])).rows[0]?.details||null;
}
export async function liveOrderReview(db:any,operations:any[],receipt:any){
 // A deleted task cannot silently count as an alert treatment.
 const ids=[...new Set([...operations.flatMap((o:any)=>(o.document.checklistAlertTasks||[]).map((t:any)=>String(t.taskId))),...(receipt?.checklistAlertTasks||[]).map((t:any)=>String(t.taskId))])];
 const live=new Set(ids.length?(await db.query('SELECT id::text FROM web_tasks WHERE id=ANY($1::bigint[])',[ids])).rows.map((t:any)=>String(t.id)):[]);
 for(const o of operations)o.document={...o.document,checklistAlertTasks:(o.document.checklistAlertTasks||[]).filter((t:any)=>live.has(String(t.taskId)))};
 if(receipt)receipt.checklistAlertTasks=(receipt.checklistAlertTasks||[]).filter((t:any)=>live.has(String(t.taskId)));
 return receipt;
}
export async function orderReviewExportReason(db:any,scheduleId:string){
 const operations=(await db.query('SELECT * FROM web_service_operations WHERE schedule_id=$1 ORDER BY position,id',[scheduleId])).rows;
 const receipt=await liveOrderReview(db,operations,await readOrderReview(db,scheduleId));
 return orderReviewBlockReason(operations,receipt);
}
