import '../src/config/env.js';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';import {randomUUID,createHash} from 'node:crypto';import {connectDatabase} from '../src/database/postgres.js';
const file=process.argv[2];if(!file)throw Error('Informe as linhas JSON da planilha filtrada.');
const raw=readFileSync(file,'utf8'),rows=JSON.parse(raw).filter((r:any[])=>r.length===5&&r[4]&&r[0]!=='CLIENTE'),batch=createHash('sha256').update(raw).digest('hex');
if(rows.length!==10)throw Error('Quantidade inesperada; revise a planilha.');
const norm=(v:any)=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const db=await connectDatabase();
try{
 await db.query('BEGIN');await db.query('SELECT pg_advisory_xact_lock(81022)');
 const visits=(await db.query('SELECT * FROM web_workshop_visits FOR UPDATE')).rows,external=(await db.query('SELECT * FROM web_workshop_external FOR UPDATE')).rows,imports=(await db.query("SELECT * FROM web_workshop_imports WHERE sheet='ENVIO A TERCEIROS'")).rows;
 if(external.filter(e=>e.source?.reconciliation_batch===batch).length===10){await db.query('ROLLBACK');console.log('Posição externa já reconciliada.');}
 else{
 const plan=rows.map((r:any[],i:number)=>{
  const matches=imports.filter(x=>norm(x.document.customer)===norm(r[0])&&norm(x.document.component)===norm(r[1])&&x.document.entered===r[4].slice(0,10));if(matches.length!==1)throw Error('Linha sem correspondência inequívoca: '+(i+2));
  const original=matches[0],d=original.document;
  const existing=external.filter(e=>norm(e.component)===norm(r[1])&&new Date(e.sent_at).toISOString().slice(0,10)===r[4].slice(0,10)&&e.visit_id===original.visit_id);
  if(existing.length>1||existing[0]?.returned_at)throw Error('Envio ambíguo ou já retornado: '+(i+2));
  let visit=existing[0]?visits.find(v=>v.id===existing[0].visit_id):null;
  if(!visit){
   // Full description or long serial at the end; no customer-only association.
   const desc=norm(d.equipment_description),suffix=String(d.equipment_description||'').trim().split(/\s+/).at(-1)||'';
   const candidates=visits.filter(v=>!v.exited_at&&!v.reconciled_out_at&&(norm(v.source?.equipment_description)===desc||(norm(suffix).length>=6&&/\d/.test(suffix)&&norm(v.source?.equipment_description).endsWith(norm(suffix)))));
   if(candidates.length===1)visit=candidates[0];
  }
  const status=r[2]==='AGUARDANDO APROVAÇÃO'?'approval':r[2]==='AGUARDANDO ORÇAMENTO'?'quotation':null;if(!status)throw Error('Situação desconhecida');
  return {id:existing[0]?.id||randomUUID(),existing:!!existing[0],original,visitId:visit?.id||null,source:{...d,reconciliation_batch:batch,reconciled_file:'Equipamentos em conserto externo atual.xlsx',reconciled_row:i+2,filtered_cells:r},component:r[1],status,notes:r[3]||'',sent:r[4].slice(0,10)+'T03:00:00Z',supplier:d.supplier||'Fornecedor a confirmar'};
 });
 const result={total:10,existing:plan.filter(p=>p.existing).length,added:plan.filter(p=>!p.existing).length,linked:plan.filter(p=>p.visitId).length,statuses:plan.reduce((a:any,p)=>{a[p.status]=(a[p.status]||0)+1;return a;},{}),suppliers:plan.reduce((a:any,p)=>{a[p.supplier]=(a[p.supplier]||0)+1;return a;},{})};
 console.log(JSON.stringify(result));
 if(!process.argv.includes('--apply'))await db.query('ROLLBACK');
 else{
  mkdirSync('artifacts',{recursive:true});writeFileSync(`artifacts/workshop-import-external-backup-${Date.now()}.json`,JSON.stringify({visits,external,imports}));
  if(!(await db.query("SELECT 1 FROM information_schema.columns WHERE table_name='web_workshop_external' AND column_name='source'")).rows.length)await db.query(readFileSync('web/sql/069_workshop_external_position.sql','utf8'));
  const keep=plan.map(p=>p.id);
  // Retire obsolete imported positions without inventing physical return dates.
  await db.query("UPDATE web_workshop_external SET reconciled_out_at=now(),version=version+1,source=source||$2::jsonb WHERE returned_at IS NULL AND created_by='Importação da planilha' AND NOT(id=ANY($1::uuid[]))",[keep,JSON.stringify({reconciled_file:'Equipamentos em conserto externo atual.xlsx',reason:'Ausente da posição confirmada; retorno não presumido.'})]);
  for(const p of plan){
   if(p.existing)await db.query('UPDATE web_workshop_external SET status=$2,notes=$3,source=$4,supplier=$5,version=version+1 WHERE id=$1',[p.id,p.status,p.notes,p.source,p.supplier]);
   else await db.query(`INSERT INTO web_workshop_external(id,visit_id,component,supplier,sent_at,status,notes,source,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'Conferência da planilha')`,[p.id,p.visitId,p.component,p.supplier,p.sent,p.status,p.notes,p.source]);
   await db.query("UPDATE web_workshop_imports SET state='imported',visit_id=$2,reason=NULL,document=document||$3::jsonb WHERE id=$1",[p.original.id,p.visitId,JSON.stringify({externalId:p.id,reconciled_file:p.source.reconciled_file})]);
   if(p.visitId)await db.query("INSERT INTO web_workshop_events(visit_id,action,actor,document) VALUES($1,'Conserto externo confirmado pela planilha','Sistema',$2)",[p.visitId,JSON.stringify({externalId:p.id,notes:p.component,status:p.status,batch})]);
  }
  // Explicit user clarification, applied only to the uniquely identified provisional BRF entry.
  const brf=visits.filter(v=>v.source?.reconciled_file==='Equipamentos em oficina atual.xlsx'&&v.source?.reconciled_row===2&&v.source?.customer==='BRF'&&!v.workshop_id);
  if(brf.length===1){await db.query("UPDATE web_workshop_visits SET workshop_id=1,version=version+1,source=source||'{\"workshopId\":1}'::jsonb,updated_at=now(),updated_by='Confirmação do usuário' WHERE id=$1",[brf[0].id]);await db.query("INSERT INTO web_workshop_events(visit_id,action,actor,document) VALUES($1,'Oficina confirmada: RJ Compressores','Confirmação do usuário','{}')",[brf[0].id]);}
  const count=(await db.query('SELECT count(*)::int n FROM web_workshop_external WHERE returned_at IS NULL AND reconciled_out_at IS NULL')).rows[0].n;if(count!==10)throw Error('Contagem externa não confere.');
  await db.query('COMMIT');console.log('Posição externa aplicada: 10 envios.');
 }
 }
}catch(e){await db.query('ROLLBACK');throw e;}finally{await db.end();}
