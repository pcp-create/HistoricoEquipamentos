import {cookies} from 'next/headers';
import {redirect} from 'next/navigation';
import ChangePassword from '@/components/change-password';
export const dynamic='force-dynamic';
export default async function Page(){const jar=await cookies();if(!jar.has('m8-access')&&!jar.has('m8-refresh'))redirect('/login');return <ChangePassword/>}
