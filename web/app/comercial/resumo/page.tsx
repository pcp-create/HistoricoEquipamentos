import {redirect} from 'next/navigation';
import {requireUser} from '@/lib/auth';
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 await requireUser();const q=await searchParams,params=new URLSearchParams();
 for(const key of ['period','company'])if(typeof q[key]==='string')params.set(key,q[key] as string);
 redirect('/comercial/acompanhamento'+(params.size?'?'+params.toString():''));
}
