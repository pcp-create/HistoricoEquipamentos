import {requireUser,sameOrigin,Unauthorized,Forbidden} from '@/lib/auth';
import {addOrderComment,orderComments} from '@/lib/service-orders/comments';
import {OrderInputError} from '@/lib/service-orders/model';
export const runtime='nodejs';
const json=(body:any,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
function failure(e:unknown){return json({error:e instanceof Unauthorized?'Sessão expirada.':e instanceof Forbidden?'Acesso não permitido.':e instanceof OrderInputError?e.message:'Não foi possível confirmar a consulta ou o registro. Atualize os comentários antes de reenviar.'},e instanceof Unauthorized?401:e instanceof Forbidden?403:e instanceof OrderInputError?400:503);}
export async function GET(request:Request){try{await requireUser();const p=new URL(request.url).searchParams;return json(await orderComments(p.get('company')||'',p.get('order')||'',p.get('before')));}catch(e){return failure(e);}}
export async function POST(request:Request){
 if(!sameOrigin(request))return json({error:'Origem inválida.'},403);
 try{const user=await requireUser();const raw=await request.text();if(raw.length>20000)throw new OrderInputError('Comentário muito extenso.');let body;try{body=JSON.parse(raw);}catch{throw new OrderInputError('Dados inválidos.');}if(body.ownerId&&body.ownerId!==user.id)throw new Forbidden();return json(await addOrderComment(body,user.email),201);}catch(e){return failure(e);}
}
