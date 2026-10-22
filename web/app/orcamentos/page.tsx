import {cookies} from 'next/headers';
import {redirect} from 'next/navigation';
import M8Quotes from '@/components/m8-quotes';
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const params=await searchParams;
 // Preserve existing saved/local quotation links.
 if(typeof params.id==='string'&&/^[0-9a-f-]{36}$/i.test(params.id))redirect('/orcamentos/novo?id='+encodeURIComponent(params.id));
 const jar=await cookies();if(!jar.has('m8-access')&&!jar.has('m8-refresh'))redirect('/login?next=/orcamentos');
 return <M8Quotes/>;
}
