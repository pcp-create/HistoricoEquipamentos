import {requireAdmin,Unauthorized,Forbidden} from '@/lib/auth';
import {getChecklistPhoto} from '@/lib/service-scheduling/checklist-photos';
export const runtime='nodejs';
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){
 try{const user=await requireAdmin();const p=await getChecklistPhoto((await params).id,user.email);if(!p)return new Response(null,{status:404});
 return new Response(new Uint8Array(p.content),{headers:{'Content-Type':p.mime,'Content-Disposition':`inline; filename*=UTF-8''${encodeURIComponent(p.filename)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }catch(e){return new Response(null,{status:e instanceof Unauthorized?401:e instanceof Forbidden?403:503});}
}
