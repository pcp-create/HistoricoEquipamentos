import {hydratePdfProductTaxes} from '@/lib/crm/product-taxes';
import {requireUser,Unauthorized} from '@/lib/auth';
import {getProposal} from '@/lib/crm/store';
import {proposalPdf} from '@/lib/crm/pdf';
import {CrmError} from '@/lib/crm/model';
import {database} from '@/lib/db';
export const runtime='nodejs';
export const maxDuration=120;
export async function GET(request:Request){
 try{
  await requireUser();const params=new URL(request.url).searchParams,includeTaxes=params.get('taxes')!=='0';const proposal=await getProposal(params.get('id')||'');
  const db=database(),draft=proposal.document;
  const [client,equipment]=await Promise.all([db.query('SELECT document,payload FROM m8_customer_directory WHERE person_id=$1 AND company_id=$2 LIMIT 1',[draft.customer,draft.company]),draft.equipment?db.query('SELECT name,model,serial FROM m8_equipment_catalog WHERE equipment_id=$1',[draft.equipment]):Promise.resolve({rows:[]})]);
  proposal.document=includeTaxes?await hydratePdfProductTaxes(draft):draft;
  const codes=[...new Set(draft.items.filter((item:any)=>item.kind==='material').map((item:any)=>item.code))];
  const products=codes.length?(await db.query("SELECT product_id::text code,NULLIF(trim(payload->>'ncm'),'') ncm FROM m8_product_catalog WHERE company_id=$1 AND product_id=ANY($2::bigint[])",[draft.company,codes])).rows:[];
  const ncms=Object.fromEntries(products.map((product:any)=>[product.code,product.ncm]));
  const bytes=await proposalPdf(proposal,client.rows[0]||{},equipment.rows[0]||{},ncms,{includeTaxes});
  return new Response(Buffer.from(bytes),{headers:{'Content-Type':'application/pdf','Content-Disposition':`inline; filename="proposta-${proposal.number}.pdf"`,'Cache-Control':'private, no-store'}});
 }catch(e){return Response.json({error:e instanceof Unauthorized?'Sessão expirada.':e instanceof CrmError?e.message:'Não foi possível gerar o PDF da proposta.'},{status:e instanceof Unauthorized?401:e instanceof CrmError?400:503});}
}
