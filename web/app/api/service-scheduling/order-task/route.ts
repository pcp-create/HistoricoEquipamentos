import {requireUser,sameOrigin,Unauthorized,Forbidden} from '@/lib/auth';
import {createOrderTask} from '@/lib/service-scheduling/order-task';
import {TaskInputError} from '@/lib/tasks/store';
import {OrderReportInputError,OrderReportConflict} from '@/lib/service-scheduling/order-report-store';
export const runtime='nodejs';
export const maxDuration=60;
const json=(value:any,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'private, no-store'}});
export async function POST(req:Request){
 if(!sameOrigin(req))return json({error:'Origem inválida.'},403);
 try{
  const user=await requireUser();
  const text=await req.text();if(text.length>20000)return json({error:'Solicitação muito extensa.'},413);
  let body;try{body=JSON.parse(text);}catch{return json({error:'Solicitação inválida.'},400);}
  return json(await createOrderTask(body,user.email));
 }catch(e){
  if(e instanceof Unauthorized)return json({error:'Sessão expirada.'},401);
  if(e instanceof Forbidden)return json({error:'Acesso não permitido.'},403);
  if(e instanceof TaskInputError||e instanceof OrderReportInputError||e instanceof OrderReportConflict)return json({error:e.message},400);
  return json({error:'Não foi possível criar a tarefa com o relatório. Tente novamente.'},503);
 }
}
