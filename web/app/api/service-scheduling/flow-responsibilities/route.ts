import {requireUser,sameOrigin,Unauthorized,Forbidden} from '@/lib/auth';
import {flowResponsibilities,saveFlowResponsibility} from '@/lib/service-scheduling/flow-responsibility';
const response=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
export async function GET(){try{await requireUser();return response(await flowResponsibilities());}catch(e){return response({error:e instanceof Unauthorized?'Sessão expirada.':'Não foi possível consultar as responsabilidades.'},e instanceof Unauthorized?401:503);}}
export async function POST(request:Request){if(!sameOrigin(request))return response({error:'Origem inválida.'},403);try{const user=await requireUser();await saveFlowResponsibility(await request.json(),user.email);return response(await flowResponsibilities());}catch(e){return response({error:e instanceof Error?e.message:'Não foi possível salvar.'},e instanceof Unauthorized?401:e instanceof Forbidden?403:400);}}
