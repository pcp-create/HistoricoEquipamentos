import {requireUser,Unauthorized,Forbidden} from '@/lib/auth';
import {partsReport} from '@/lib/service-scheduling/parts-report-store';
export const runtime='nodejs';
export async function GET(){
 const headers={'Cache-Control':'private, no-store'};
 try{const user=await requireUser();return Response.json(await partsReport(user.email),{headers});}
 catch(e){const status=e instanceof Unauthorized?401:e instanceof Forbidden?403:503;return Response.json({error:status===401?'Sessão expirada. Entre novamente.':status===403?'Acesso não permitido.':'Não foi possível gerar o relatório. Tente novamente.'},{status,headers});}
}
