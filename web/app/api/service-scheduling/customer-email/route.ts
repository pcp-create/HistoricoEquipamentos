import {requireUser,sameOrigin,Unauthorized,Forbidden} from '@/lib/auth';
import {prepareCustomerEmail,CustomerEmailError} from '@/lib/service-scheduling/customer-email';
export const runtime='nodejs';
export const maxDuration=60;
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
export async function POST(request:Request){if(!sameOrigin(request))return json({error:'Origem inválida.'},403);try{const user=await requireUser();return json(await prepareCustomerEmail(await request.json(),user.email));}catch(e){return json({error:e instanceof Unauthorized?'Sessão expirada.':e instanceof Forbidden?'Acesso não permitido.':e instanceof CustomerEmailError?e.message:'Não foi possível preparar o e-mail.'},e instanceof Unauthorized?401:e instanceof Forbidden?403:400);}}
