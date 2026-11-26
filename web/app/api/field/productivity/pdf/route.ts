import {requireUser,Unauthorized,Forbidden} from '@/lib/auth';
import {productivityPdfResponse} from '@/lib/technical-productivity/pdf-response';
export const runtime='nodejs';
export const maxDuration=120;
export async function GET(request:Request){try{const user=await requireUser();return await productivityPdfResponse(request,user.email)}catch(e){return Response.json({error:e instanceof Unauthorized?'Sessão expirada.':e instanceof Forbidden?'Acesso não permitido.':'Não foi possível gerar o relatório.'},{status:e instanceof Unauthorized?401:e instanceof Forbidden?403:503})}}
