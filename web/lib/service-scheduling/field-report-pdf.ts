import "server-only";
import {database} from "../db";
import {Forbidden} from "../auth";
import {checklistPdf,ChecklistPdfPending} from "./checklist-pdf";
import {orderReportPdf} from "./order-report-store";
export async function fieldReportPdf(email:string,input:{operationId?:string|null;scheduleId?:string|null;mode?:string|null}){
 const mode=input.mode||"complete";
 if(mode!=="complete"&&mode!=="summary")throw new ChecklistPdfPending("Selecione relatório completo ou resumido.");
 if(!input.operationId)return orderReportPdf({scheduleId:input.scheduleId,mode},email,true);
 if(!/^[0-9a-f-]{36}$/i.test(input.operationId))throw new Forbidden();
 const row=(await database().query("SELECT id FROM web_service_operations WHERE id=$1 AND sent_at IS NOT NULL AND (document->>'responsible'=$2 OR document->'support' ? $2)",[input.operationId,email])).rows[0];
 if(!row)throw new Forbidden();
 const report=await checklistPdf(input.operationId,email,mode,true);
 if(!report)throw new ChecklistPdfPending("Esta operação ainda não possui relatório preenchido.");
 return report;
}
