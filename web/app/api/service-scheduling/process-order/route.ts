import {requireUser,sameOrigin,Unauthorized,Forbidden} from '@/lib/auth';
import {processScheduleOrder} from '@/lib/service-scheduling/process-order';
import {OrderInputError} from '@/lib/service-orders/model';
export const runtime='nodejs';
export const maxDuration=120;
export async function POST(request:Request){
 if(!sameOrigin(request))return Response.json({error:'Origem inválida.'},{status:403});
 try{
  const user=await requireUser();const body=await request.json();
  return Response.json(await processScheduleOrder(String(body.scheduleId||''),body.id,user.email),{headers:{'Cache-Control':'private, no-store'}});
 }catch(e){return Response.json({error:e instanceof Unauthorized?'Sessão expirada.':e instanceof Forbidden?'Você não tem permissão para processar esta OS.':e instanceof OrderInputError?e.message:'Não foi possível confirmar o processamento. Confira a OS no M8 antes de tentar novamente.'},{status:e instanceof Unauthorized?401:e instanceof Forbidden?403:e instanceof OrderInputError?400:503});}
}
