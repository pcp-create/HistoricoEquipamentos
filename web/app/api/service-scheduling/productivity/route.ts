import {requireUser,Forbidden,Unauthorized} from '@/lib/auth';
import {technicalProductivity} from '@/lib/technical-productivity/store';
import {validMonth} from '@/lib/technical-productivity/model';
export const runtime='nodejs';
export async function GET(request:Request){try{await requireUser();const month=new URL(request.url).searchParams.get('month')||'';if(!validMonth(month))return Response.json({error:'Mês inválido.'},{status:400});return Response.json(await technicalProductivity(month),{headers:{'Cache-Control':'private, no-store'}});}catch(e){return Response.json({error:e instanceof Unauthorized?'Sessão expirada.':e instanceof Forbidden?'Acesso não permitido.':'Não foi possível carregar os apontamentos.'},{status:e instanceof Unauthorized?401:e instanceof Forbidden?403:503});}}
