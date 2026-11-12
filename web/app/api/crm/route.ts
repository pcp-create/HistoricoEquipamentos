import {requireUser,sameOrigin,Unauthorized} from '@/lib/auth';
import {catalogs,crmOverview,listCrm,getOpportunity,getProposal,saveOpportunity,createProposal,saveProposal,saveCatalog} from '@/lib/crm/store';
import {beginConversion,continueConversion} from '@/lib/crm/conversion';
import {CrmError} from '@/lib/crm/model';
import {OrderInputError} from '@/lib/service-orders/model';
export const runtime='nodejs';
export const maxDuration=120;
const json=(b:unknown,status=200)=>Response.json(b,{status,headers:{'Cache-Control':'private, no-store'}});
function failure(e:unknown){const known=e instanceof CrmError||e instanceof OrderInputError;return json({error:e instanceof Unauthorized?'Sessão expirada.':known?e.message:'Não foi possível concluir. Atualize os dados antes de tentar novamente.'},e instanceof Unauthorized?401:known?400:503);}
export async function GET(req:Request){try{await requireUser();const p=new URL(req.url).searchParams;return json(p.has('catalogs')?await catalogs():p.has('overview')?await crmOverview():p.has('opportunity')?await getOpportunity(p.get('opportunity')||''):p.has('proposal')?await getProposal(p.get('proposal')||''):await listCrm(p.get('kind')||'opportunities',p.get('q')||'',Number(p.get('page')||1),p.get('status')||''));}catch(e){return failure(e);}}
export async function POST(req:Request){if(!sameOrigin(req))return json({error:'Origem inválida.'},403);try{
 const user=await requireUser(),body=await req.text();if(body.length>500000)return json({error:'Solicitação muito grande.'},413);let b;try{b=JSON.parse(body);}catch{throw new CrmError('Dados inválidos.');}
 switch(b.action){
 case 'save-opportunity':return json(await saveOpportunity(b,user.email));
 case 'create-proposal':return json(await createProposal(b,user.email));
 case 'save-proposal':return json(await saveProposal(b,user.email));
 case 'save-catalog':return json(await saveCatalog(b,user.email));
 case 'convert':return json(await beginConversion(b,user.email));
 case 'advance':case 'retry':return json(await continueConversion(b,user.email));
 default:throw new CrmError('Ação inválida.');
 }
 }catch(e){return failure(e);}}
