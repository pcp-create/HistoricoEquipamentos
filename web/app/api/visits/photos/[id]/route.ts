import {requireUser,Unauthorized,Forbidden} from '@/lib/auth';
import {getVisitPhoto} from '@/lib/visits/photos';
export async function GET(_r:Request,{params}:{params:Promise<{id:string}>}){
 try{
 const user=await requireUser(),{id}=await params;
 if(!/^[0-9a-f-]{36}$/i.test(id))return new Response(null,{status:404});
 const row=await getVisitPhoto(id,user.email);
 if(!row)return new Response(null,{status:404});
 return new Response(new Uint8Array(row.content),{headers:{'Content-Type':'image/jpeg','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }catch(error){return new Response(null,{status:error instanceof Unauthorized?401:error instanceof Forbidden?403:503});}
}
