import {requireUser,sameOrigin,Unauthorized} from '@/lib/auth';
import {ReportInputError,ReportConflict,reportCustomers,reportsList,reportDetail,reportImage,saveReport,saveImage} from '@/lib/vibration-reports/store';
export const runtime='nodejs';
export const maxDuration=60;
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
const json=(body:unknown,status=200)=>Response.json(body,{status,headers});
function failure(error:unknown){
 if(error instanceof Unauthorized)return json({error:'Sessão expirada. Entre novamente no sistema.'},401);
 if(error instanceof ReportInputError)return json({error:error.message},400);
 if(error instanceof ReportConflict)return json({error:error.message},409);
 console.error('VIBRATION_REPORT_FAILED');return json({error:'Não foi possível acessar os relatórios. Tente novamente.'},503);
}
export async function GET(req:Request){try{
 await requireUser();const p=new URL(req.url).searchParams;
 if(p.has('customers'))return json(await reportCustomers(p.get('search')||''));
 if(p.has('image')){const image=await reportImage(p.get('image')!);return image?new Response(new Uint8Array(image.content),{headers:{...headers,'Content-Type':image.content_type}}):json({error:'Imagem não encontrada.'},404);}
 if(p.has('id')){const report=await reportDetail(p.get('id')!);return report?json(report):json({error:'Relatório não encontrado.'},404);}
 const offset=Number(p.get('offset')||0);if(!Number.isSafeInteger(offset)||offset<0)throw new ReportInputError('Página inválida.');
 return json(await reportsList(p.get('q')||'',offset));
}catch(e){return failure(e);}}
export async function POST(req:Request){
 if(!sameOrigin(req))return json({error:'Origem inválida.'},403);
 try{const user=await requireUser();
 if(req.headers.get('content-type')?.includes('multipart/form-data')){
  if(Number(req.headers.get('content-length')||0)>3100000)return json({error:'Imagem muito grande.'},413);
  const file=(await req.formData()).get('file');if(!(file instanceof File))throw new ReportInputError('Selecione uma imagem.');
  return json(await saveImage(file,user.email),201);
 }
 const raw=await req.text();if(raw.length>2000000)return json({error:'Relatório muito grande.'},413);
 let body;try{body=JSON.parse(raw);}catch{throw new ReportInputError('Dados inválidos.');}
 return json(await saveReport(body,user.email));
 }catch(e){return failure(e);}
}
