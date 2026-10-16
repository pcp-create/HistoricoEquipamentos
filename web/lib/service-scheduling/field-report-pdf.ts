import "server-only";
import {PDFDocument} from "pdf-lib";
import {database} from "../db";
import {Forbidden} from "../auth";
import {checklistPdf,ChecklistPdfPending} from "./checklist-pdf";
export async function fieldReportPdf(email:string, input:{operationId?:string|null;scheduleId?:string|null;mode?:string|null}){
 const mode=input.mode||"complete";
 if(mode!=="complete"&&mode!=="summary")throw new ChecklistPdfPending("Selecione relatório completo ou resumido.");
 const db=database();
 const profile=(await db.query("SELECT enabled FROM web_user_access WHERE email=$1",[email])).rows[0];
 if(!profile?.enabled)throw new Forbidden();
 let ids:string[];
 if(input.operationId){
  if(!/^[0-9a-f-]{36}$/i.test(input.operationId))throw new Forbidden();
  const row=(await db.query("SELECT id FROM web_service_operations WHERE id=$1 AND sent_at IS NOT NULL AND (document->>'responsible'=$2 OR document->'support' ? $2)",[input.operationId,email])).rows[0];
  if(!row)throw new Forbidden();ids=[row.id];
 }else{
  if(!/^\d+$/.test(input.scheduleId||""))throw new Forbidden();
  ids=(await db.query("SELECT id FROM web_service_operations WHERE schedule_id=$1 AND sent_at IS NOT NULL AND document ? 'checklistRun' AND (document->>'responsible'=$2 OR document->'support' ? $2) ORDER BY position,id",[input.scheduleId,email])).rows.map(r=>r.id);
 }
 if(!ids.length)throw new ChecklistPdfPending("Não há relatório disponível nas operações enviadas para você.");
 const merged=await PDFDocument.create();
 for(const id of ids){
  const report=await checklistPdf(id,email,mode,true);
  if(!report)continue;
  const source=await PDFDocument.load(report.bytes);
  for(const page of await merged.copyPages(source,source.getPageIndices()))merged.addPage(page);
 }
 if(!merged.getPageCount())throw new ChecklistPdfPending("Salve e sincronize o relatório antes de gerar o PDF.");
 return {bytes:await merged.save(),filename:input.operationId?"Relatorio-operacao.pdf":"Relatorio-OS.pdf"};
}
