import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {monthClosure,applyClosedForecast} from '../lib/sales-projection/month-closure';
test('closed month preserves last eligible photograph despite later ERP changes, new captures and deletion',async()=>{
 const db=new PGlite(),g=globalThis as any,previous=g.historyPool;
 const query=(sql:string,args?:any[])=>db.query(sql.replace('BEGIN READ WRITE','BEGIN'),args);
 g.historyPool={query,connect:async()=>({query,release(){}})};
 try{
  await db.exec('CREATE ROLE anon;CREATE ROLE authenticated');
  for(const file of ['../supabase/migrations/020_sales_projection_snapshots.sql','../supabase/migrations/023_projection_snapshot_admin_delete.sql','sql/089_projection_daily_snapshots.sql','sql/091_projection_month_closures.sql'])await db.exec(readFileSync(file,'utf8'));
  const insert=async(id:number,at:string,amount:number)=>db.query(`INSERT INTO web_sales_projection_snapshots(id,period,label,created_by,created_at,document) VALUES($1,'2026-10','Diário','Teste',$2,$3)`,[`00000000-0000-4000-8000-${String(id).padStart(12,'0')}`,at,JSON.stringify({rows:[{company:1,projection:amount,billed:90}]})]);
  await insert(1,'2026-10-30T02:30:00Z',100);await insert(2,'2026-11-01T02:30:00Z',120);
  // A manual capture made after the end of the month must not rewrite its closing.
  await insert(3,'2026-11-01T13:00:00Z',90);
  assert.equal(await monthClosure('2026-10','2026-10-31'),null);
  const closing=await monthClosure('2026-10','2026-11-01');assert.equal(closing!.rows![0].projection,120);
  const live:any=[{company:1,projection:90,billed:110,pending:0}];
  const result=applyClosedForecast(live,closing!.rows);
  assert.equal(result[0].projection,120);assert.equal(result[0].billed,110);assert.equal(result[0].pending,10);assert.equal(live[0].projection,90);
  await db.exec("BEGIN;SELECT set_config('app.projection_snapshot_admin_delete','on',true);DELETE FROM web_sales_projection_snapshots;COMMIT");
  assert.equal((await monthClosure('2026-10','2026-12-01'))!.rows![0].projection,120);
  assert.equal((await monthClosure('2026-09','2026-12-01'))!.metadata.status,'missing');
  await assert.rejects(db.exec("UPDATE web_projection_month_closures SET label='Outra'"),/imutáveis/);
  await db.exec(readFileSync('sql/092_projection_closure_corrections.sql','utf8'));
  await assert.rejects(db.exec("UPDATE web_projection_month_closures SET label='Sem auditoria'"),/imutáveis/);
  await db.exec(`BEGIN;
    INSERT INTO web_projection_closure_corrections(id,period,previous_closure,corrected_closure,reason,actor)
    SELECT '00000000-0000-4000-8000-000000000099',period,to_jsonb(c),to_jsonb(c)||jsonb_build_object('label','Correção autorizada','document','{"rows":[{"company":1,"projection":150}]}'::jsonb),'Total informado pelo usuário','Gestor' FROM web_projection_month_closures c;
    SELECT set_config('app.projection_closure_correction','00000000-0000-4000-8000-000000000099',true);
    UPDATE web_projection_month_closures SET label='Correção autorizada',document='{"rows":[{"company":1,"projection":150}]}'::jsonb;
    COMMIT;`);
  assert.equal((await monthClosure('2026-10','2026-12-01'))!.rows![0].projection,150);
  assert.equal((await db.query<any>('SELECT previous_closure FROM web_projection_closure_corrections')).rows[0].previous_closure.document.rows[0].projection,120);
  await assert.rejects(db.exec("UPDATE web_projection_month_closures SET label='Outra'"),/imutáveis/);
  await assert.rejects(db.exec("DELETE FROM web_projection_month_closures"),/imutáveis/);
  await assert.rejects(db.exec("DELETE FROM web_projection_closure_corrections"),/imutáveis/);
 }finally{g.historyPool=previous;await db.close();}
});

test('closed forecast balance matches October by company, rounds cents and never becomes negative',()=>{
 const current:any=[{company:1,billed:1118676.12,projection:1118676.12,pending:0},{company:2,billed:216607.26,projection:216607.26,pending:0},{company:27404,billed:153242.48,projection:153242.48,pending:0}];
 const saved:any=[{company:1,projection:1123528.38},{company:2,projection:216607.26},{company:27404,projection:156287.04}];
 const result=applyClosedForecast(current,saved);
 assert.deepEqual(result.map(r=>r.pending),[4852.26,0,3044.56]);
 assert.equal(result.reduce((sum,r)=>sum+Math.round(r.pending*100),0)/100,7896.82);
 assert.equal(applyClosedForecast([{...current[0],billed:2000000}],saved)[0].pending,0);
 assert.equal(applyClosedForecast(current),current);
 assert.equal(current[0].pending,0);
});
