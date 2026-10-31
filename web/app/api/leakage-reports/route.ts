import {requireUser,sameOrigin,Unauthorized} from '@/lib/auth';
import {database} from '@/lib/db';
import {LeakageInputError,LeakageConflict,leakageId} from '@/lib/leakage-reports/model';
import {saveLeakage,saveLeakageImage,leakageList,leakageDetail} from '@/lib/leakage-reports/store';
export const runtime='nodejs';
export const maxDuration=60;
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
const json=(body:unknown,status=200)=>Response.json(body,{status,headers});
function failure(e:unknown){return json({error:e instanceof Unauthorized?'Sessão expirada. Entre novamente.':e instanceof LeakageInputError||e instanceof LeakageConflict?e.message:'Não foi possível acessar os levantamentos. Tente novamente.'},e instanceof Unauthorized?401:e instanceof LeakageConflict?409:e instanceof LeakageInputError?400:503);}
export async function GET(req:Request){try{
 await requireUser();const p=new URL(req.url).searchParams;
 if(p.has('image')){const row=(await database().query('SELECT content,content_type FROM web_leakage_report_images WHERE id=$1',[leakageId(p.get('image'))])).rows[0];return row?new Response(new Uint8Array(row.content),{headers:{...headers,'Content-Type':row.content_type}}):json({error:'Imagem não encontrada.'},404);}
 if(p.has('id')){const version=p.has('version')?Number(p.get('version')):undefined;if(version!==undefined&&(!Number.isSafeInteger(version)||version<1))throw new LeakageInputError('Revisão inválida.');return json(await leakageDetail(p.get('id')!,version));}
 const offset=Number(p.get('offset')||0);if(!Number.isSafeInteger(offset)||offset<0||offset>100000)throw new LeakageInputError('Página inválida.');
 return json(await leakageList(p.get('q')||'',offset));
 }catch(e){return failure(e);}}
export async function POST(req:Request){
 if(!sameOrigin(req))return json({error:'Origem inválida.'},403);
 try{const user=await requireUser();
  if(req.headers.get('content-type')?.includes('multipart/form-data')){if(Number(req.headers.get('content-length')||0)>3100000)return json({error:'Imagem muito grande.'},413);const file=(await req.formData()).get('file');if(!(file instanceof File))throw new LeakageInputError('Selecione uma imagem.');return json(await saveLeakageImage(file,user.email),201);}
  const raw=await req.text();if(raw.length>3100000)return json({error:'Levantamento muito grande.'},413);
  let body;try{body=JSON.parse(raw);}catch{throw new LeakageInputError('Dados inválidos.');}return json(await saveLeakage(body,user.email));
 }catch(e){return failure(e);}
}
