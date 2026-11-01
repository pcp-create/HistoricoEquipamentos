import 'server-only';
import {randomUUID} from 'node:crypto';
import {database} from '../db';
import {salesProjection} from './store';
export const dailySnapshotHour=23;
export const dailySnapshotMinute=30;
export class DailySnapshotUnavailable extends Error {}
export async function dailySnapshotCreate(now=new Date(),readProjection=salesProjection){
 const currentDay=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(now);
 const day=currentDay;
 const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'America/Sao_Paulo',hour:'2-digit',hourCycle:'h23'}).format(now));
 const minute=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'America/Sao_Paulo',minute:'2-digit'}).format(now));
 if(hour!==dailySnapshotHour||minute<dailySnapshotMinute)return {state:'waiting',recorded:false,day,hour:dailySnapshotHour,minute:dailySnapshotMinute,timeZone:'America/Sao_Paulo',scheduledFor:day+'T23:30:00-03:00',message:'Nenhuma parcial foi registrada: aguardando 23h30 de Brasília. Para registrar agora, use Registrar parcial agora na tela da projeção.'};
 const db=database();
 const existing=(await db.query('SELECT snapshot_id FROM web_projection_daily_snapshots WHERE day=$1',[day])).rows[0];
 if(existing)return {state:'exists',day,id:existing.snapshot_id};
 const period=day.slice(0,7),document=await readProjection(period,day);
 if(!document.complete)throw new DailySnapshotUnavailable('Integração incompleta. A parcial automática será tentada novamente.');
 for(const value of [document.updatedAt,document.ordersUpdatedAt]){
  const timestamp=value?Date.parse(value):NaN;
  if(!Number.isFinite(timestamp)||timestamp>now.getTime()+60000||now.getTime()-timestamp>2*60*60*1000)
   throw new DailySnapshotUnavailable('Integração sem atualização nas últimas duas horas. A parcial automática será tentada novamente.');
 }
 const c=await db.connect();
 try{
  await c.query('BEGIN READ WRITE');
  const claimed=await c.query('INSERT INTO web_projection_daily_snapshots(day) VALUES($1) ON CONFLICT(day) DO NOTHING RETURNING day',[day]);
  if(!claimed.rows.length){
   const previous=(await c.query('SELECT snapshot_id FROM web_projection_daily_snapshots WHERE day=$1',[day])).rows[0];
   await c.query('COMMIT');return {state:'exists',day,id:previous.snapshot_id};
  }
  const id=randomUUID(),label=`Diário · ${day.split('-').reverse().join('/')}`;
  await c.query('INSERT INTO web_sales_projection_snapshots(id,period,label,created_by,document) VALUES($1,$2,$3,$4,$5)',[id,period,label,'Automação diária',JSON.stringify({...document,snapshotKind:'daily',snapshotDay:day})]);
  await c.query('UPDATE web_projection_daily_snapshots SET snapshot_id=$2 WHERE day=$1',[day,id]);
  await c.query('COMMIT');return {state:'created',day,id,period,label};
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
