import {requireUser,Unauthorized} from '@/lib/auth';
import {getProposal} from '@/lib/crm/store';
import {proposalPdf} from '@/lib/crm/pdf';
import {CrmError} from '@/lib/crm/model';
import {database} from '@/lib/db';
export const runtime='nodejs';
export async function GET(request:Request){
 try{
  await requireUser();const proposal=await getProposal(new URL(request.url).searchParams.get('id')||'');
  const db=database(),draft=proposal.document;
  const [client,equipment]=await Promise.all([db.query('SELECT document,payload FROM m8_customer_directory WHERE person_id=$1 AND company_id=$2 LIMIT 1',[draft.customer,draft.company]),draft.equipment?db.query('SELECT name,model,serial FROM m8_equipment_catalog WHERE equipment_id=$1',[draft.equipment]):Promise.resolve({rows:[]})]);
  const bytes=await proposalPdf(proposal,client.rows[0]||{},equipment.rows[0]||{});
  return new Response(Buffer.from(bytes),{headers:{'Content-Type':'application/pdf','Content-Disposition':`inline; filename="proposta-${proposal.number}.pdf"`,'Cache-Control':'private, no-store'}});
 }catch(e){return Response.json({error:e instanceof Unauthorized?'Sessão expirada.':e instanceof CrmError?e.message:'Não foi possível gerar o PDF da proposta.'},{status:e instanceof Unauthorized?401:e instanceof CrmError?400:503});}
}
