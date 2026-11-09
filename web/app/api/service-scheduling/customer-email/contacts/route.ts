import {requireUser,sameOrigin,Unauthorized,Forbidden} from '@/lib/auth';
import {customerEmailContacts} from '@/lib/service-scheduling/customer-email-contacts';
import {CustomerEmailError} from '@/lib/service-scheduling/customer-email';
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'private, no-store'}});
async function handle(request:Request,write=false){
 if(write&&!sameOrigin(request))return json({error:'Origem inválida.'},403);
 try{const user=await requireUser(),body=write?await request.json():null;return json(await customerEmailContacts(write?body.scheduleId:new URL(request.url).searchParams.get('scheduleId')||'',user.email,body));}
 catch(e){return json({error:e instanceof Unauthorized?'Sessão expirada.':e instanceof Forbidden?'Acesso não permitido.':e instanceof CustomerEmailError?e.message:'Não foi possível carregar ou salvar os contatos.'},e instanceof Unauthorized?401:e instanceof Forbidden?403:400);}
}
export const GET=(request:Request)=>handle(request);
export const POST=(request:Request)=>handle(request,true);
