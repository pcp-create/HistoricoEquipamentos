import {requireUser,sameOrigin,Unauthorized,Forbidden} from '@/lib/auth';
import {AdminInputError} from '@/lib/admin-store';
import {leadSellerOptions,changeLeadSeller} from '@/lib/visits/lead-seller';
export const runtime='nodejs';
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
function fail(e:unknown){return json({error:e instanceof Unauthorized?'Sessão expirada.':e instanceof Forbidden?'Você não pode alterar o responsável deste lead.':e instanceof AdminInputError?e.message:'Não foi possível atualizar o vendedor do lead.'},e instanceof Unauthorized?401:e instanceof Forbidden?403:e instanceof AdminInputError?400:503);}
export async function GET(req:Request){try{const user=await requireUser();return json(await leadSellerOptions(new URL(req.url).searchParams.get('customer'),user.email));}catch(e){return fail(e);}}
export async function POST(req:Request){if(!sameOrigin(req))return json({error:'Origem inválida.'},403);try{const user=await requireUser();let body;try{body=await req.json();}catch{throw new AdminInputError('Dados inválidos.');}return json(await changeLeadSeller(body,user.email));}catch(e){return fail(e);}}
