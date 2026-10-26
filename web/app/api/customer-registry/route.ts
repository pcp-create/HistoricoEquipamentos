import {requireUser,sameOrigin,Unauthorized,Forbidden} from '@/lib/auth';
import {AdminInputError} from '@/lib/admin-store';
import {M8RequestError} from '@/lib/service-orders/m8';
import {customerLookups,customerRegistry,companyId,saveCustomer,syncCustomerDetails,syncCustomerPage} from '@/lib/customer-registry/store';
export const runtime='nodejs';
export const maxDuration=300;
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
const fail=(e:unknown)=>json({error:e instanceof AdminInputError||e instanceof M8RequestError?e.message:e instanceof Unauthorized?'Sessão expirada.':e instanceof Forbidden?'Acesso não permitido.':'Não foi possível processar o cadastro de clientes.'},e instanceof Unauthorized?401:e instanceof Forbidden?403:e instanceof AdminInputError?400:503);
export async function GET(request:Request){try{await requireUser();return json(await customerRegistry(companyId(new URL(request.url).searchParams.get('company')||1)))}catch(e){return fail(e)}}
export async function POST(request:Request){if(!sameOrigin(request))return json({error:'Origem inválida.'},403);try{const user=await requireUser();const raw=await request.text();if(raw.length>100000)return json({error:'Conteúdo muito grande.'},413);let body;try{body=JSON.parse(raw)}catch{throw new AdminInputError('Dados inválidos.')};const company=companyId(body.company);if(body.action==='lookups')return json(await customerLookups(company));if(body.action==='sync')return json(await syncCustomerPage(company,body.page));if(body.action==='details')return json(await syncCustomerDetails(company,body.ids));if(body.action==='save')return json(await saveCustomer(body,user.email));throw new AdminInputError('Ação inválida.')}catch(e){return fail(e)}}
