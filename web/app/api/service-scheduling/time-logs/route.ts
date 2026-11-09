import {requireUser,sameOrigin,Unauthorized,Forbidden} from '@/lib/auth';
import {deleteTimeLog} from '@/lib/service-scheduling/time-log-delete';
import {replicateTimeLog,TeamSessionError} from '@/lib/service-scheduling/team-sessions';
import {TimeRequestError} from '@/lib/service-scheduling/time-request-store';
export const runtime='nodejs';
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
export async function POST(request:Request){
 if(!sameOrigin(request))return json({error:'Origem inválida.'},403);
 try{
  const user=await requireUser(),raw=await request.text();if(raw.length>20000)return json({error:'Dados excedem o limite.'},413);
  let body;try{body=JSON.parse(raw);}catch{return json({error:'Dados inválidos.'},400);}
  if(body.action==='delete')return json(await deleteTimeLog(body,user.email));
  if(body.action==='replicate')return json(await replicateTimeLog(body,user.email,true));
  return json({error:'Ação inválida.'},400);
 }catch(e){return json({error:e instanceof Unauthorized?'Sessão expirada.':e instanceof Forbidden?'Acesso não permitido.':e instanceof TimeRequestError||e instanceof TeamSessionError?e.message:'Não foi possível alterar o apontamento.'},e instanceof Unauthorized?401:e instanceof Forbidden?403:e instanceof TimeRequestError||e instanceof TeamSessionError?400:503);}
}
