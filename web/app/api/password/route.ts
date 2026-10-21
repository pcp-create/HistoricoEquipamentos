import {requireUser,sameOrigin,Unauthorized} from '@/lib/auth';
import {changeInitialPassword} from '@/lib/employee-login';
import {AdminInputError} from '@/lib/admin-store';
export const runtime='nodejs';
export async function POST(r:Request){
 if(!sameOrigin(r))return Response.json({error:'Origem inválida.'},{status:403});
 try{const user=await requireUser(true);const raw=await r.text();if(raw.length>2000)throw new AdminInputError('Dados inválidos.');let body;try{body=JSON.parse(raw)}catch{throw new AdminInputError('Dados inválidos.')}await changeInitialPassword(body,user);return Response.json({ok:true},{headers:{'Cache-Control':'no-store'}})}catch(e){return Response.json({error:e instanceof AdminInputError?e.message:e instanceof Unauthorized?'Sessão expirada. Entre novamente.':'Não foi possível alterar a senha.'},{status:e instanceof AdminInputError?400:e instanceof Unauthorized?401:503})}
}
