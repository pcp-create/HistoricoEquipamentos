import {canManageVisits} from "@/lib/access-roles";
import {requireUser, Unauthorized, Forbidden} from '@/lib/auth';
import {database} from '@/lib/db';
import {visitIdentity} from '@/lib/visits/store';
import {visitCustomerDirectory} from '@/lib/visits/customer-directory';
export const runtime='nodejs';
export async function GET(request:Request) {
 try {
  const user=await requireUser();
  const actor = await visitIdentity(database(),user.email);
  const params=new URL(request.url).searchParams;
  const owner=(params.get("seller")||user.email).toLowerCase();
  if(owner!==user.email){ if(!canManageVisits(actor.role)) throw new Forbidden(); await visitIdentity(database(),owner); }
  const page=Math.max(1,Number.parseInt(params.get('page')||'1',10)||1);
  return Response.json(await visitCustomerDirectory(params.get('q'),page,owner),{headers:{'Cache-Control':'private, no-store'}});
 } catch(error) {
  return Response.json({error:'Não foi possível carregar os clientes.'},{status:error instanceof Unauthorized?401:error instanceof Forbidden?403:503});
 }
}
