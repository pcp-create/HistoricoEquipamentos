import {cookies} from 'next/headers';
import {redirect} from 'next/navigation';
import SiteHeader from '@/components/site-header';
import ProductivityMap from '@/components/technical-productivity';
export const dynamic='force-dynamic';
export default async function Page(){const jar=await cookies();if(!jar.has('m8-access')&&!jar.has('m8-refresh'))redirect('/login?next=%2Fprogramacao%2Fprodutividade');return <><SiteHeader active="scheduling"/><main className="technical-productivity-page"><ProductivityMap/></main></>;}
