import {requireUser,Unauthorized,Forbidden} from '@/lib/auth';
import {database} from '@/lib/db';
import {canViewTask,taskAdministrator} from '@/lib/tasks/privacy';
export const runtime='nodejs';
export async function GET(request:Request){
 try{
  const user=await requireUser(), raw=new URL(request.url).searchParams.get('id')||'';
  if(!/^[1-9]\d{0,14}$/.test(raw))return Response.json({error:'Informe um número de tarefa válido.'},{status:400});
  const db=database(),task=(await db.query("SELECT id::text,title,status,assigned_to,followers,to_jsonb(web_tasks)->>'restricted' AS restricted FROM web_tasks WHERE id=$1",[raw])).rows[0];
  if(!task||!canViewTask(task,user.email,await taskAdministrator(user.email,db)))return Response.json({error:'Tarefa não encontrada ou indisponível para este usuário.'},{status:404});
  return Response.json({id:task.id,title:task.title,status:task.status},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return Response.json({error:e instanceof Unauthorized?'Sessão expirada.':e instanceof Forbidden?'Acesso não permitido.':'Não foi possível consultar a tarefa.'},{status:e instanceof Unauthorized?401:e instanceof Forbidden?403:503});}
}
