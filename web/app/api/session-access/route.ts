import {requireUser,Unauthorized} from '@/lib/auth';
import {accessRecord} from '@/lib/admin-store';
import {userModules,jobTitles} from '@/lib/user-modules';
import {canManageVisits} from '@/lib/access-roles';
export async function GET(){
 try{
  const user=await requireUser(),record=await accessRecord(user.email);
  return Response.json({admin:record?.role==='admin',visitManager:canManageVisits(record),displayName:record?.display_name||user.email,cacheUser:user.id,cacheScope:user.id+":"+(record?.role||"user"),modules:userModules(record),jobTitles:jobTitles(record),checkedAt:new Date().toISOString(),accessUpdatedAt:record?.updated_at?new Date(record.updated_at).toISOString():''},{headers:{'Cache-Control':'no-store'}});
 }catch(error){return Response.json({error:'Acessos indisponíveis.'},{status:error instanceof Unauthorized?401:503,headers:{'Cache-Control':'no-store'}});}
}
