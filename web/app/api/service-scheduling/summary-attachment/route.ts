import {requireUser,sameOrigin,Unauthorized,Forbidden} from '@/lib/auth';
import {OrderInputError} from '@/lib/service-orders/model';
import {OrderReportInputError,OrderReportConflict} from '@/lib/service-scheduling/order-report-store';
import {attachSummaryReport} from '@/lib/service-scheduling/summary-attachment';
export const runtime='nodejs';
export const maxDuration=120;
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
export async function POST(request:Request){
 if(!sameOrigin(request))return json({error:'Origem inválida.'},403);
 try{const user=await requireUser();return json(await attachSummaryReport(await request.json(),user.email));}
 catch(e){return json({error:e instanceof Unauthorized?'Sessão expirada.':e instanceof Forbidden?'Acesso não permitido.':e instanceof OrderInputError||e instanceof OrderReportInputError||e instanceof OrderReportConflict?e.message:'Não foi possível anexar o relatório resumido. Confira os anexos no ERP antes de tentar novamente.'},e instanceof Unauthorized?401:e instanceof Forbidden?403:e instanceof OrderReportConflict?409:400);}
}
