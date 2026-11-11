import {requireUser,Unauthorized} from '@/lib/auth';
import {orderActivity} from '@/lib/service-orders/activity';
import {OrderInputError} from '@/lib/service-orders/model';
export const runtime='nodejs';
export async function GET(request:Request){
 try{
  await requireUser();const p=new URL(request.url).searchParams;
  return Response.json(await orderActivity(p.get('company')||'',p.get('order')||'',Number(p.get('page')||0)),{headers:{'Cache-Control':'private, no-store'}});
 }catch(e){return Response.json({error:e instanceof Unauthorized?'Sessão expirada.':e instanceof OrderInputError?e.message:'Não foi possível consultar o histórico da OS.'},{status:e instanceof Unauthorized?401:e instanceof OrderInputError?400:503});}
}
