import {requireUser,Unauthorized,Forbidden} from "@/lib/auth";
import {fieldReportPdf} from "@/lib/service-scheduling/field-report-pdf";
import {ChecklistPdfPending} from "@/lib/service-scheduling/checklist-pdf";
export const runtime="nodejs";
export async function GET(req:Request){
 try{
  const user=await requireUser(),p=new URL(req.url).searchParams;
  const report=await fieldReportPdf(user.email,{operationId:p.get("operationId"),scheduleId:p.get("scheduleId"),mode:p.get("mode")});
  return new Response(new Uint8Array(report.bytes),{headers:{"Content-Type":"application/pdf","Content-Disposition":'inline; filename="'+report.filename+'"',"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
 }catch(e){return Response.json({error:e instanceof ChecklistPdfPending?e.message:e instanceof Forbidden?"Relatório não disponível para sua conta.":e instanceof Unauthorized?"Entre novamente para visualizar.":"Não foi possível gerar o relatório."},{status:e instanceof ChecklistPdfPending?409:e instanceof Forbidden?403:e instanceof Unauthorized?401:503});}
}
