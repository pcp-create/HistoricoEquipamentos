import {applyProposalTaxType} from '@/lib/crm/proposal-tax-type';
import {taxBudgetTypes,hydrateProductTaxes} from '@/lib/crm/product-taxes';
import {proposalDraft} from '@/lib/crm/model';
import {productAverageCosts} from '@/lib/crm/product-costs';
import {crmDirectory} from "@/lib/crm/directory";
import {requireUser,sameOrigin,Unauthorized,Forbidden} from '@/lib/auth';
import {accessRecord} from '@/lib/admin-store';
import {canOpenPath,userModules} from '@/lib/user-modules';
import {catalogs,crmOverview,listCrm,getOpportunity,getProposal,saveOpportunity,createProposal,saveProposal,saveCatalog} from '@/lib/crm/store';
import {beginConversion,continueConversion} from '@/lib/crm/conversion';
import {CrmError} from '@/lib/crm/model';
import {QuoteValidation} from '@/lib/quotes/types';
import {OrderInputError} from '@/lib/service-orders/model';
import {CustomerEmailError} from '@/lib/service-scheduling/customer-email';
import {changeProposalReview} from '@/lib/crm/proposal-review-store';
import {sendProposalEmail,prepareProposalEmail,proposalEmailDetails,saveProposalEmailSettings,resolveProposalEmail} from '@/lib/crm/proposal-email';
export const runtime='nodejs';
export const maxDuration=120;
const json=(b:unknown,status=200)=>Response.json(b,{status,headers:{'Cache-Control':'private, no-store'}});
function failure(e:unknown){const known=e instanceof CrmError||e instanceof OrderInputError||e instanceof QuoteValidation||e instanceof CustomerEmailError;return json({error:e instanceof Unauthorized?'Sessão expirada.':known?e.message:'Não foi possível concluir. Atualize os dados antes de tentar novamente.'},e instanceof Unauthorized?401:e instanceof Forbidden?403:known?400:503);}
export async function GET(req:Request){try{const user=await requireUser();const p=new URL(req.url).searchParams;return json(p.has('proposalEmail')?{...await proposalEmailDetails(p.get('proposalEmail')||''),canConfigure:canOpenPath(userModules(await accessRecord(user.email)),'/configuracoes/cadastros/crm')}:p.has('taxTypes')?{rows:await taxBudgetTypes(p.get('company')||'')}:p.has('productCosts')?{rows:await productAverageCosts(p.get('company')||'',(p.get('codes')||'').split(',').filter(Boolean))}:['leads','customers','contacts'].includes(p.get('kind')||'')?await crmDirectory(p.get('kind')!,p.get('q')||'',Number(p.get('page')||1),user.email):p.has('catalogs')?await catalogs():p.has('overview')?await crmOverview():p.has('opportunity')?await getOpportunity(p.get('opportunity')||''):p.has('proposal')?{...await getProposal(p.get('proposal')||''),currentUser:user.email}:await listCrm(p.get('kind')||'opportunities',p.get('q')||'',Number(p.get('page')||1),p.get('status')||''));}catch(e){return failure(e);}}
export async function POST(req:Request){if(!sameOrigin(req))return json({error:'Origem inválida.'},403);try{
 const user=await requireUser(),body=await req.text();if(body.length>1400000)return json({error:'Solicitação muito grande.'},413);let b;try{b=JSON.parse(body);}catch{throw new CrmError('Dados inválidos.');}
 switch(b.action){
 case 'simulate-taxes':return json({draft:await hydrateProductTaxes(await applyProposalTaxType(proposalDraft(b.draft),b.typeId))});
 case 'save-opportunity':return json(await saveOpportunity(b,user.email));
 case 'create-proposal':return json(await createProposal(b,user.email));
 case 'save-proposal':return json(await saveProposal(b,user.email));
 case 'request_review':case 'complete_review':return json(await changeProposalReview(b,user.email));
 case 'send-proposal-email':return json(await sendProposalEmail(b,user.email));
 case 'prepare-proposal-email':return json(await prepareProposalEmail(b));
 case 'resolve-proposal-email':return json(await resolveProposalEmail(b,user.email));
 case 'proposal-email-contact':return json(await proposalEmailDetails(b.id,user.email,b.contact));
 case 'save-proposal-email-settings':if(!canOpenPath(userModules(await accessRecord(user.email)),'/configuracoes/cadastros/crm'))throw new Forbidden();return json(await saveProposalEmailSettings(b.config,user.email));
 case 'save-catalog':return json(await saveCatalog(b,user.email));
 case 'convert':return json(await beginConversion(b,user.email));
 case 'advance':case 'retry':return json(await continueConversion(b,user.email));
 default:throw new CrmError('Ação inválida.');
 }
 }catch(e){return failure(e);}}
