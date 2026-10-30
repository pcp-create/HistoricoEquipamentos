import {test} from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';import{PGlite}from'@electric-sql/pglite';
import{dailySnapshotCreate}from'../lib/sales-projection/daily-snapshot';
import{GET,POST}from'../app/api/sales-projection/snapshots/automation/route';
test('daily snapshot authenticates automation before accessing the database',async()=>{
 const token=process.env.TASK_AUTOMATION_TOKEN,legacy=process.env.PREVENTIVE_REPORT_TOKEN;
 try{
  delete process.env.TASK_AUTOMATION_TOKEN;delete process.env.PREVENTIVE_REPORT_TOKEN;
  assert.equal((await POST(new Request('http://localhost/api',{method:'POST'}))).status,503);
  process.env.TASK_AUTOMATION_TOKEN='a'.repeat(32);
  assert.equal((await POST(new Request('http://localhost/api',{method:'POST'}))).status,401);
  assert.equal((await GET(new Request('http://localhost/api',{headers:{authorization:'Bearer '+'b'.repeat(32)}}))).status,401);
  assert.equal((await GET(new Request('http://localhost/api',{headers:{authorization:'Bearer '+'a'.repeat(32)}}))).status,200);
 }finally{if(token===undefined)delete process.env.TASK_AUTOMATION_TOKEN;else process.env.TASK_AUTOMATION_TOKEN=token;if(legacy===undefined)delete process.env.PREVENTIVE_REPORT_TOKEN;else process.env.PREVENTIVE_REPORT_TOKEN=legacy;}
});
test('automatic snapshots use Brasilia day/month, preserve manual captures, survive retries and deletions, and roll back failed inserts',async()=>{
 const db=new PGlite(),g=globalThis as any,previous=g.historyPool;let staleRead=false,failInsert=false,reads=0;
 const query=(sql:string,args?:any[])=>{if(failInsert&&sql.startsWith('INSERT INTO web_sales_projection_snapshots'))throw Error('Simulated insert failure');return db.query(sql.replace('BEGIN READ WRITE','BEGIN'),args);};
 g.historyPool={query:async(sql:string,args:any[])=>staleRead&&sql.startsWith('SELECT snapshot_id')?{rows:[]}:query(sql,args),connect:async()=>({query,release(){}})};
 let now=new Date('2026-10-30T21:00:00Z');
 const load=async(period:string,closingDay?:string)=>{assert.ok(closingDay);assert.equal(closingDay.slice(0,7),period);reads++;return {complete:true,period,rows:[],details:[],target:100,updatedAt:now.toISOString(),ordersUpdatedAt:now.toISOString()} as any;};
 try{
  await db.exec('CREATE ROLE anon;CREATE ROLE authenticated');
  await db.exec(readFileSync('../supabase/migrations/020_sales_projection_snapshots.sql','utf8'));
  await db.exec(readFileSync('../supabase/migrations/023_projection_snapshot_admin_delete.sql','utf8'));
  await db.exec(readFileSync('sql/089_projection_daily_snapshots.sql','utf8'));
  assert.equal((await dailySnapshotCreate(now,load)).state,'waiting');assert.equal(reads,0);
  now=new Date('2026-10-31T03:00:00Z');const first=await dailySnapshotCreate(now,load);assert.equal(first.state,'created');assert.equal(first.day,'2026-10-30');
  assert.equal((await dailySnapshotCreate(now,load)).id,first.id);assert.equal(reads,1);
  staleRead=true;assert.equal((await dailySnapshotCreate(now,load)).state,'exists');staleRead=false;
  await db.exec("INSERT INTO web_sales_projection_snapshots(id,period,label,created_by,document) VALUES('12345678-1234-4234-8234-123456789abc','2026-10','Manual','user','{}')");
  now=new Date('2026-11-01T03:00:00Z');const monthEnd=await dailySnapshotCreate(now,load);assert.equal(monthEnd.day,'2026-10-31');assert.equal((monthEnd as any).period,'2026-10');
  now=new Date('2026-11-02T03:00:00Z');const nextMonth=await dailySnapshotCreate(now,load);assert.equal((nextMonth as any).period,'2026-11');
  now=new Date('2026-11-03T03:00:00Z');await assert.rejects(dailySnapshotCreate(now,async(p,d)=>({...await load(p,d),complete:false})),/incompleta/);
  await assert.rejects(dailySnapshotCreate(now,async(p,d)=>({...await load(p,d),ordersUpdatedAt:'2026-11-02T10:00:00Z'})),/duas horas/);
  failInsert=true;await assert.rejects(dailySnapshotCreate(now,load),/Simulated/);failInsert=false;
  assert.equal((await dailySnapshotCreate(now,load)).state,'created');
  await db.exec("BEGIN;SELECT set_config('app.projection_snapshot_admin_delete','on',true)");
  await db.query('DELETE FROM web_sales_projection_snapshots WHERE id=$1',[first.id]);await db.exec('COMMIT');
  now=new Date('2026-10-31T04:00:00Z');const deleted=await dailySnapshotCreate(now,load);assert.equal(deleted.state,'exists');assert.equal(deleted.id,null);
  assert.equal((await db.query('SELECT * FROM web_projection_daily_snapshots')).rows.length,4);
  assert.equal((await db.query('SELECT * FROM web_sales_projection_snapshots')).rows.length,4);
  await assert.rejects(db.exec("UPDATE web_sales_projection_snapshots SET label='alterado'"),/imutáveis/);
 }finally{g.historyPool=previous;await db.close();}
});
