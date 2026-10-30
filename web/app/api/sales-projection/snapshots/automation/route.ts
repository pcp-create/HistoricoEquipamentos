import {automationAuthError,automationAuthCheck} from '@/lib/automation/access';
import {dailySnapshotCreate,DailySnapshotUnavailable} from '@/lib/sales-projection/daily-snapshot';
export const runtime='nodejs';
export const maxDuration=120;
const headers={'Cache-Control':'private, no-store'};
export async function GET(req:Request){return automationAuthCheck(req);}
export async function POST(req:Request){
 const denied=automationAuthError(req);if(denied)return denied;
 try{return Response.json({ok:true,...await dailySnapshotCreate()},{headers});}
 catch(e){return Response.json({error:e instanceof DailySnapshotUnavailable?e.message:'Não foi possível registrar a parcial automática. Confira a integração e a migração de parciais diárias.'},{status:503,headers});}
}
