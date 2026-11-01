import {automationAuthError,automationAuthCheck} from '@/lib/automation/access';
import {dailySnapshotCreate,DailySnapshotUnavailable,dailySnapshotHour,dailySnapshotMinute} from '@/lib/sales-projection/daily-snapshot';
export const runtime='nodejs';
export const maxDuration=120;
const headers={'Cache-Control':'private, no-store'};
export async function GET(req:Request){const response=automationAuthCheck(req);if(response.status!==200)return response;return Response.json({ok:true,authenticated:true,schedule:{hour:dailySnapshotHour,minute:dailySnapshotMinute,timeZone:'America/Sao_Paulo'},version:'daily-23:30'},{headers});}
export async function POST(req:Request){
 const denied=automationAuthError(req);if(denied)return denied;
 try{return Response.json({ok:true,...await dailySnapshotCreate()},{headers});}
 catch(e){return Response.json({error:e instanceof DailySnapshotUnavailable?e.message:'Não foi possível registrar a parcial automática. Confira a integração e a migração de parciais diárias.'},{status:503,headers});}
}
