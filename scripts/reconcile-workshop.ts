import '../src/config/env.js';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import {connectDatabase} from '../src/database/postgres.js';
const input=process.argv[2];if(!input)throw Error('Informe o plano JSON revisado.');
const raw=readFileSync(input,'utf8'),plan=JSON.parse(raw),batch=createHash('sha256').update(raw).digest('hex');
if(!Array.isArray(plan.rows)||plan.rows.length!==58)throw Error('Quantidade inesperada.');
if(!process.argv.includes('--apply')){console.log({rows:plan.rows.length,removed:plan.removed.length});process.exit(0);}
const db=await connectDatabase();
try{
 await db.query('BEGIN');await db.query('SELECT pg_advisory_xact_lock(81022)');
 const before=(await db.query('SELECT * FROM web_workshop_visits FOR UPDATE')).rows;
 const previous=before.filter(v=>v.source?.reconciliation_batch===batch);
 if(previous.length){if(previous.length!==58)throw Error('Reconciliação parcial inesperada');await db.query('ROLLBACK');console.log('Reconciliação já aplicada; nenhuma alteração.');process.exitCode=0;}
 else{
  mkdirSync('artifacts',{recursive:true});
  writeFileSync(`artifacts/workshop-import-backup-${Date.now()}.json`,JSON.stringify({visits:before,imports:(await db.query('SELECT * FROM web_workshop_imports')).rows,events:(await db.query('SELECT * FROM web_workshop_events')).rows,external:(await db.query('SELECT * FROM web_workshop_external')).rows}));
  if(!(await db.query("SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='web_workshop_visits' AND column_name='reconciled_out_at'")).rows.length)await db.query(readFileSync('web/sql/068_workshop_reconciliation.sql','utf8'));
  for(const r of plan.removed){
   const old=before.find(v=>v.id===r.id);if(!old||old.version!==r.version||old.exited_at)throw Error('Entrada mudou desde a conferência.');
   const reason='Não consta na posição atual confirmada por Equipamentos em oficina atual.xlsx. Sem data de saída informada; preservado para auditoria.';
   await db.query('UPDATE web_workshop_visits SET reconciled_out_at=now(),reconciliation_reason=$2,version=version+1,updated_at=now(),updated_by=$3 WHERE id=$1',[r.id,reason,'Conferência da planilha']);
   await db.query("INSERT INTO web_workshop_events(visit_id,action,actor,document) VALUES($1,'Retirado da posição atual pela conferência','Sistema',$2)",[r.id,JSON.stringify({batch,reason,previous:old})]);
  }
  for(const r of plan.rows){
   const id=r.existingId||randomUUID(),source={...r.source,reconciliation_batch:batch};
   if(r.existingId){
    const old=before.find(v=>v.id===id);if(!old||old.exited_at||old.reconciled_out_at)throw Error('Entrada deixou de estar aberta.');
    await db.query('UPDATE web_workshop_visits SET stage=$2,notes=$3,source=$4,version=version+1,updated_at=now(),updated_by=$5 WHERE id=$1',[id,r.stage,r.notes,source,'Conferência da planilha']);
   }else await db.query(`INSERT INTO web_workshop_visits(id,equipment_id,workshop_id,entered_at,stage,notes,source,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,'Conferência da planilha','Conferência da planilha')`,[id,r.equipmentId||null,r.workshopId||null,r.entered+'T03:00:00Z',r.stage,r.notes,source]);
   await db.query("INSERT INTO web_workshop_events(visit_id,action,actor,document) VALUES($1,'Presença confirmada pela planilha filtrada','Sistema',$2)",[id,JSON.stringify({batch,row:r.line,notes:r.source.original_status,previous:before.find(v=>v.id===id)||null})]);
   if(r.importId)await db.query("UPDATE web_workshop_imports SET state='imported',visit_id=$2,reason=NULL WHERE id=$1",[r.importId,id]);
   else await db.query(`INSERT INTO web_workshop_imports(id,filename,sheet,row_number,document,state,visit_id) VALUES($1,'Equipamentos em oficina atual.xlsx','Posição atual',$2,$3,'imported',$4)`,[createHash('sha256').update(batch+':'+r.line).digest('hex'),r.line,source,id]);
  }
  const counts=(await db.query('SELECT stage,count(*)::int count FROM web_workshop_visits WHERE exited_at IS NULL AND reconciled_out_at IS NULL GROUP BY stage ORDER BY stage')).rows;
  if(counts.reduce((n,r)=>n+r.count,0)!==58)throw Error('Contagem final não confere; transação cancelada.');
  await db.query('COMMIT');console.log(JSON.stringify({active:58,statuses:counts}));
 }
}catch(e){await db.query('ROLLBACK');throw e;}finally{await db.end();}
