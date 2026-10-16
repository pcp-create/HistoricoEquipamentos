import { requireUser, requireAdmin, sameOrigin, Forbidden, Unauthorized } from '@/lib/auth';
import { database } from '@/lib/db';
import { mapAccess } from '@/lib/service-scheduling/field-map';
import { normalizeUserPhoto, userPhotoContentType } from '@/lib/user-photo';
export const runtime='nodejs';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
const json=(error:string,status:number)=>Response.json({error},{status,headers});
const emailOf=(req:Request)=>(new URL(req.url).searchParams.get('email')||'').trim().toLowerCase();
const failure=(e:unknown)=>json(e instanceof Unauthorized?'Entre novamente.':e instanceof Forbidden?'Acesso não permitido.':'Não foi possível acessar a foto.',e instanceof Unauthorized?401:e instanceof Forbidden?403:503);
export async function GET(req:Request){try{
 const user=await requireUser(),email=emailOf(req);
 if(user.email!==email)await mapAccess(user.email);
 const row=(await database().query('SELECT image FROM web_user_photos WHERE email=$1',[email])).rows[0];
 if(!row)return new Response(null,{status:404,headers});
 return new Response(new Uint8Array(row.image),{headers:{...headers,'Content-Type':userPhotoContentType(row.image)}});
}catch(e){return failure(e)}}
async function change(req:Request,remove:boolean){
 if(!sameOrigin(req))return json('Origem inválida.',403);
 try{
 const actor=await requireAdmin(),email=emailOf(req);
 if(!email||email.length>254)return json('Usuário inválido.',400);
 let photo:Buffer|null=null;
 if(!remove){
  const reader=req.body?.getReader();if(!reader)return json('Selecione uma foto.',400);
  const chunks:Uint8Array[]=[];let size=0;
  while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>2*1024*1024){await reader.cancel();return json('Envie uma foto de até 2 MB.',413)}chunks.push(value)}
  try{photo=await normalizeUserPhoto(Buffer.concat(chunks))}catch{return json('Foto inválida. Use JPG, PNG ou WebP de até 2 MB.',400)}
 }
 const c=await database().connect();try{
  await c.query('BEGIN READ WRITE');
  if(!(await c.query('SELECT email FROM web_user_access WHERE email=$1 FOR SHARE',[email])).rows.length){await c.query('ROLLBACK');return json('Salve o usuário antes de anexar a foto.',404)}
  if(remove)await c.query('DELETE FROM web_user_photos WHERE email=$1',[email]);
  else await c.query('INSERT INTO web_user_photos(email,image,updated_by) VALUES($1,$2,$3) ON CONFLICT(email) DO UPDATE SET image=excluded.image,updated_by=excluded.updated_by,updated_at=now()',[email,photo,actor.email]);
  await c.query("INSERT INTO web_access_events(event,email,actor) VALUES($1,$2,$3)",[remove?'photo_removed':'photo_updated',email,actor.email]);
  await c.query('COMMIT');return Response.json({saved:true},{headers});
 }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
 }catch(e){return failure(e)}
}
export const POST=(req:Request)=>change(req,false);
export const DELETE=(req:Request)=>change(req,true);
