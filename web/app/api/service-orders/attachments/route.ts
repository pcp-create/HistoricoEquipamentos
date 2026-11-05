import {requireUser,sameOrigin,Unauthorized} from '@/lib/auth';
import {OrderInputError} from '@/lib/service-orders/model';
import {attachmentMaxBytes,listOrderAttachments,downloadOrderAttachment,uploadOrderAttachment} from '@/lib/service-orders/attachments';
export const runtime='nodejs';
export const maxDuration=120;
const headers={'Cache-Control':'private, no-store'};
function failure(e:unknown){return Response.json({error:e instanceof Unauthorized?'Sessão expirada.':e instanceof OrderInputError?e.message:'Não foi possível consultar ou enviar os anexos no ERP.'},{status:e instanceof Unauthorized?401:e instanceof OrderInputError?400:503,headers});}
export async function GET(req:Request){
 try{
  await requireUser();const p=new URL(req.url).searchParams,company=p.get('company')||'',order=p.get('order')||'',id=p.get('id');
  if(id){const file=await downloadOrderAttachment(company,order,id);return new Response(new Uint8Array(file.bytes),{headers:{...headers,'Content-Type':'application/octet-stream','X-Content-Type-Options':'nosniff','Content-Disposition':`attachment; filename="${file.name}"`}});}
  return Response.json({rows:await listOrderAttachments(company,order)},{headers});
 }catch(e){return failure(e);}
}
export async function POST(req:Request){
 if(!sameOrigin(req))return Response.json({error:'Origem inválida.'},{status:403,headers});
 try{
  const user=await requireUser();
  if(Number(req.headers.get('content-length')||0)>attachmentMaxBytes+65536)throw new OrderInputError('Cada anexo pode ter até 3 MB.');
  const data=await req.formData(),file=data.get('file');
  if(!(file instanceof File)||!file.size||file.size>attachmentMaxBytes)throw new OrderInputError('Selecione um arquivo de até 3 MB.');
  const result=await uploadOrderAttachment(String(data.get('company')||''),String(data.get('order')||''),file.name,Buffer.from(await file.arrayBuffer()),user.email);
  return Response.json(result,{headers});
 }catch(e){return failure(e);}
}
