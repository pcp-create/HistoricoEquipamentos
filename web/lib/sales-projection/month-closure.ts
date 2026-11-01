import 'server-only';
import {database} from '../db';
import {rounded,type Summary} from './model';
export type ProjectionClosure={status:'closed'|'missing';snapshotId?:string;label?:string;capturedAt?:string;correction?:{reason:string;referenceDay:string;recordedAt:string}};
export async function monthClosure(period:string,today:string):Promise<{metadata:ProjectionClosure;rows?:Summary[]}|null>{
 if(period>=today.slice(0,7))return null;
 const db=database();
 let row=(await db.query('SELECT * FROM web_projection_month_closures WHERE period=$1',[period])).rows[0];
 if(!row){
  const c=await db.connect();
  try{
   await c.query('BEGIN READ WRITE');
   // Only photographs actually taken in the month (or its original daily close)
   // qualify. A new manual capture of a past month cannot replace its baseline.
   await c.query(`INSERT INTO web_projection_month_closures(period,snapshot_id,label,captured_at,document)
    SELECT s.period,s.id,s.label,s.created_at,s.document FROM web_sales_projection_snapshots s
    LEFT JOIN web_projection_daily_snapshots d ON d.snapshot_id=s.id
    WHERE s.period=$1 AND jsonb_typeof(s.document->'rows')='array' AND jsonb_array_length(s.document->'rows')>0
      AND ((s.created_at AT TIME ZONE 'America/Sao_Paulo')::date>=($1||'-01')::date
       AND s.created_at<((($1||'-01')::date+interval '1 month') AT TIME ZONE 'America/Sao_Paulo')
       OR to_char(d.day,'YYYY-MM')=$1)
    ORDER BY COALESCE(d.day,(s.created_at AT TIME ZONE 'America/Sao_Paulo')::date) DESC,s.created_at DESC,s.id DESC
    LIMIT 1 ON CONFLICT(period) DO NOTHING`,[period]);
   row=(await c.query('SELECT * FROM web_projection_month_closures WHERE period=$1',[period])).rows[0];
   await c.query('COMMIT');
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 }
 if(!row)return {metadata:{status:'missing'}};
 return {metadata:{status:'closed',snapshotId:row.snapshot_id,label:row.label,capturedAt:new Date(row.captured_at).toISOString(),...(row.document.closureCorrection?{correction:row.document.closureCorrection}:{})},rows:row.document.rows};
}
export function applyClosedForecast(rows:Summary[],baseline?:Summary[]):Summary[]{
 if(!baseline)return rows;
 const amounts=new Map(baseline.map(row=>[row.company,row.projection]));
 return rows.map(row=>{
  const projection=amounts.get(row.company);
  if(projection===undefined)return row;
  return {...row,projection,pending:Math.max(0,rounded(projection-row.billed))};
 });
}
