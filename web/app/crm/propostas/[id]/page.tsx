import {cookies} from 'next/headers';
import {redirect,notFound} from 'next/navigation';
import CrmProposal from '@/components/crm-proposal';
export const dynamic='force-dynamic';
export default async function Page({params}:{params:Promise<{id:string}>}){const jar=await cookies();if(!jar.has('m8-access')&&!jar.has('m8-refresh'))redirect('/login');const {id}=await params;if(!/^[0-9a-f-]{36}$/i.test(id))notFound();return <CrmProposal id={id}/>;}
