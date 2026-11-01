import {requireUser} from '@/lib/auth';
import {accessRecord} from '@/lib/admin-store';
import CommercialManagement from '@/components/commercial-management';
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<{period?:string;company?:string}>}){
 const user=await requireUser();
 const [access,q]=await Promise.all([accessRecord(user.email),searchParams]);
 return <CommercialManagement canManage={access?.enabled===true&&access.role==='admin'} initialPeriod={/^20\d{2}-(0[1-9]|1[0-2])$/.test(q.period||'')?q.period:undefined} initialCompany={['1','2','27404'].includes(q.company||'')?q.company:'all'}/>;
}
