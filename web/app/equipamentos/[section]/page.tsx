import CustomerFleet from '@/components/customer-fleet';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import EquipmentDashboard from '@/components/equipment-dashboard';
import { isEquipmentSection } from '@/lib/equipment-sections';
import { planReturnPath } from '@/lib/plan-return-path';
export const dynamic = 'force-dynamic';
export default async function Page({params,searchParams}:{params:Promise<{section:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const {section}=await params;
 if(!isEquipmentSection(section))notFound();
 const jar=await cookies();
 if(!jar.has('m8-access')&&!jar.has('m8-refresh')){
  const query=new URLSearchParams();for(const [key,value] of Object.entries(await searchParams))if(typeof value==='string')query.set(key,value);
  redirect('/login?next='+encodeURIComponent(planReturnPath('/equipamentos/'+section+'?'+query)));
 }
 if(section === "clientes") return <CustomerFleet/>;
 return <EquipmentDashboard key={section} section={section}/>;
}
