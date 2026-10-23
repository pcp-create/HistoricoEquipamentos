import '../src/config/env.js';import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';import {randomUUID,createHash} from 'node:crypto';import {connectDatabase} from '../src/database/postgres.js';
const file=process.argv[2];if(!file)throw Error('Informe as correspondências JSON com o histórico.');const raw=readFileSync(file,'utf8'),input=JSON.parse(raw),batch=createHash('sha256').update(raw).digest('hex');if(input.length!==17)throw Error('Quantidade inesperada');
const db=await connectDatabase();
try{await db.query('BEGIN');await db.query('SELECT pg_advisory_xact_lock(81022)');
 const visits=(await db.query('SELECT * FROM web_workshop_visits FOR UPDATE')).rows;
 if(visits.filter(v=>v.source?.rental_reconciliation_batch===batch).length===17){await db.query('ROLLBACK');console.log('Posição da locação já aplicada.');}
 else{
 const imports=(await db.query("SELECT * FROM web_workshop_imports WHERE sheet='Equipamentos Locação em revisão'")).rows;
 const stages:Record<string,string>={'1':'diagnosis','3':'approval','4':'parts','6':'repair','9':'disposal','11':'scheduled'};
 const plan=input.map((r:any)=>{
  const date=new Date(Date.parse('2026-10-22T03:00:00Z')-Number(r.current[0])*86400000).toISOString().slice(0,10);
  const matches=r.matches.filter((m:any)=>String(m.cells[3]).slice(0,10)===date);if(matches.length!==1)throw Error('Data não corresponde à posição atual');
  const original=imports.find(i=>i.row_number===matches[0].row);if(!original||original.document.entered!==date)throw Error('Histórico não confirmado');
  const existing=visits.filter(v=>v.source?.sheet===original.sheet&&v.source?.row===original.row_number);if(existing.length>1||existing[0]?.exited_at)throw Error('Entrada ambígua ou com saída física');
  const status=String(matches[0].cells[4]),stage=stages[status.split(' ')[0]];if(!stage)throw Error('Situação não mapeada');
  if(r.current[4]!=='RJ COMPRESSORES')throw Error('Oficina não confirmada');
  return {id:existing[0]?.id||randomUUID(),existing:existing[0]||null,original,date,stage,notes:r.current[3]||'',source:{...original.document,sheet:original.sheet,row:original.row_number,rental_reconciliation_batch:batch,rental_reconciled_file:'Maquinas de Locação em Revisão na Oficina Atual.xlsx',reference_date:'2026-10-22',reported_days:r.current[0],filtered_cells:r.current,original_status:status,customer:'Frota própria',fleet_code:matches[0].cells[1]}};
 });
 console.log(JSON.stringify({count:17,restore:plan.filter((p:any)=>p.existing?.reconciled_out_at).length,add:plan.filter((p:any)=>!p.existing).length,unlinked:plan.filter((p:any)=>!p.original.document.equipmentId).length}));
 if(!process.argv.includes('--apply'))await db.query('ROLLBACK');else{
 mkdirSync('artifacts',{recursive:true});writeFileSync(`artifacts/workshop-import-rental-backup-${Date.now()}.json`,JSON.stringify({visits,imports}));
 await db.query(readFileSync('web/sql/070_workshop_rental_stages.sql','utf8'));
 for(const p of plan){
 if(p.existing)await db.query("UPDATE web_workshop_visits SET reconciled_out_at=NULL,reconciliation_reason=NULL,stage=$2,source=$3,notes=$4,workshop_id=1,version=version+1,updated_at=now(),updated_by='Conferência da locação' WHERE id=$1",[p.id,p.stage,p.source,p.notes]);
 else await db.query("INSERT INTO web_workshop_visits(id,equipment_id,workshop_id,entered_at,stage,notes,source,created_by,updated_by) VALUES($1,$2,1,$3,$4,$5,$6,'Conferência da locação','Conferência da locação')",[p.id,p.original.document.equipmentId||null,p.date+'T03:00:00Z',p.stage,p.notes,p.source]);
 await db.query("INSERT INTO web_workshop_events(visit_id,action,actor,document) VALUES($1,'Presença da frota confirmada pela planilha atual','Sistema',$2)",[p.id,JSON.stringify({batch,notes:p.source.original_status,previous:p.existing,filename:p.source.rental_reconciled_file})]);
 await db.query("UPDATE web_workshop_imports SET state='imported',visit_id=$2,reason=NULL WHERE id=$1",[p.original.id,p.id]);
 }
 const total=(await db.query('SELECT count(*)::int n FROM web_workshop_visits WHERE exited_at IS NULL AND reconciled_out_at IS NULL')).rows[0].n;if(total!==75)throw Error('Contagem final não confere');
 await db.query('COMMIT');console.log('Aplicado: 58 registros anteriores + 17 da frota = 75.');
 }
 }
}catch(e){await db.query('ROLLBACK');throw e;}finally{await db.end();}
