import { Client } from 'pg';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
const db = new Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:true,ca:readFileSync(new URL('../certs/supabase-ca.crt',import.meta.url),'utf8')}});
try {
 await db.connect();
 if (!process.argv.includes('--apply')) {
  console.log(JSON.stringify((await db.query("SELECT status,count(*)::int FROM web_tasks GROUP BY status ORDER BY status")).rows));
 } else {
  await db.query('BEGIN');
  await db.query('SELECT pg_advisory_xact_lock(81021,1)');
  const before=(await db.query("SELECT * FROM web_tasks WHERE status<>'completed' FOR UPDATE")).rows;
  const ids=before.map(t=>t.id), batch=randomUUID();
  const folder=new URL('../../.m8/task-status-reset/',import.meta.url);
  mkdirSync(folder,{recursive:true});
  writeFileSync(new URL(batch+'.json',folder),JSON.stringify({batch,before},null,2),{mode:0o600});
  await db.query("UPDATE web_tasks SET status='not_started',kanban_column='pending',updated_at=now(),updated_by='Sistema',version=version+1 WHERE id=ANY($1::bigint[])",[ids]);
  await db.query("INSERT INTO web_task_notes(task_id,title,description,automatic,created_by,created_name) SELECT unnest($1::bigint[]),'Status ajustado em massa',$2,true,'Sistema','Sistema'",[ids,`Alterado para Não iniciado por solicitação do administrador. Responsável e datas preservados. Lote ${batch}.`]);
  const invalid=(await db.query("SELECT count(*)::int n FROM web_tasks WHERE id=ANY($1::bigint[]) AND (status<>'not_started' OR kanban_column<>'pending')",[ids])).rows[0].n;
  if(invalid) throw Error('Falha na conferência');
  await db.query('COMMIT');
  console.log(JSON.stringify({batch,updated:ids.length,statuses:(await db.query('SELECT status,count(*)::int FROM web_tasks GROUP BY status ORDER BY status')).rows}));
 }
} catch { await db.query('ROLLBACK').catch(()=>{}); console.error('Não foi possível concluir a operação.');process.exitCode=1; }
finally { await db.end(); }
