import {requireUser,Unauthorized} from '@/lib/auth';
import {quoteHistory,quoteOverview,quoteDetail,QuoteFilterError} from '@/lib/m8-quotes';
import {csvCell} from '@/lib/filters';
import {companyName} from '@/lib/company-names';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store'};
export async function GET(request:Request){
 try{
  await requireUser();const params=new URL(request.url).searchParams;
  if(params.has('overview'))return Response.json(await quoteOverview(),{headers});
  if(params.has('id')){const detail=await quoteDetail(params.get('company')||'',params.get('id')||'');return Response.json(detail||{error:'Orçamento não encontrado.'},{status:detail?200:404,headers});}
  const exporting=params.get('export')==='csv',result=await quoteHistory(params,exporting);
  if(exporting){const materials=params.get('view')==='materials';const columns=['Empresa','Número','Revisão','Emissão','Cliente','CPF/CNPJ','Descrição','Tipo','Status','Situação','Validade','Total do orçamento',...(materials?['ID item','Código produto','Material','Referência','Quantidade','Unidade','Valor unitário','Total do material']:[])];const lines=result.rows.map(r=>[companyName(r.company_id),r.number,r.revision,r.emission,r.client,r.document,r.description,r.type_name,r.status,r.situation,r.validity,r.total,...(materials?[r.item_id,r.product_id,r.material,r.reference,r.quantity,r.unit,r.unit_price,r.material_total]:[])].map(csvCell).join(';'));return new Response('\uFEFF'+[columns.join(';'),...lines].join('\r\n'),{headers:{...headers,'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="Orcamentos-M8.csv"'}});}
  return Response.json(result,{headers});
 }catch(e){const status=e instanceof Unauthorized?401:e instanceof QuoteFilterError?400:503;return Response.json({error:status===401?'Sessão expirada.':status===400?(e as Error).message:'Não foi possível consultar os orçamentos.'},{status,headers});}
}
