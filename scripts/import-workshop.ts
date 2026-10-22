import '../src/config/env.js';
import {readFileSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {connectDatabase} from '../src/database/postgres.js';
const input=process.argv[2];if(!input)throw Error('Informe o arquivo JSON preparado.');
const rows=JSON.parse(readFileSync(input,'utf8')) as any[];
if(!process.argv.includes('--apply')){console.log(JSON.stringify({rows:rows.length,ready:rows.filter(r=>!r.reason).length}));process.exit(0);}
const db=await connectDatabase();const at=(v:string)=>v+'T03:00:00Z';
try{
 await db.query('BEGIN');await db.query('SELECT pg_advisory_xact_lock(81022)');
 await db.query(`INSERT INTO web_workshop_imports(id,filename,sheet,row_number,document,reason)
 SELECT id,'Manutenção Interna atualizada.xlsm',sheet,row_number,document,reason FROM jsonb_to_recordset($1) AS r(id text,sheet text,row_number integer,document jsonb,reason text) ON CONFLICT(id) DO NOTHING`,[JSON.stringify(rows.map(r=>({...r,row_number:r.row})))]);
 const imported=new Set((await db.query("SELECT id FROM web_workshop_imports WHERE state='imported'")).rows.map(r=>r.id));
 const existing=(await db.query('SELECT id,equipment_id::text,entered_at,exited_at FROM web_workshop_visits')).rows;
 const visits:any[]=[],events:any[]=[],updates:any[]=[],external:any[]=[];
 for(const r of rows.filter(r=>!r.external&&!r.reason&&!imported.has(r.id))){
  const d=r.document;
  if(!d.exited&&existing.some(v=>v.equipment_id===d.equipmentId&&!v.exited_at)){updates.push({id:r.id,reason:'Equipamento já possui entrada aberta no sistema'});continue;}
  if(existing.some(v=>v.equipment_id===d.equipmentId&&new Date(v.entered_at).getTime()===Date.parse(at(d.entered)))){updates.push({id:r.id,reason:'Outra linha já registrou a mesma máquina e data de entrada'});continue;}
  const v={id:randomUUID(),equipment_id:d.equipmentId,workshop_id:d.workshopId,entered_at:at(d.entered),exited_at:d.exited?at(d.exited):null,expected_at:d.expected,stage:d.stage,notes:d.notes,source:{...d,sheet:r.sheet,row:r.row}};
  visits.push(v);existing.push(v);updates.push({id:r.id,visit_id:v.id});events.push({visit_id:v.id,action:'Importado da planilha',document:{sheet:r.sheet,row:r.row,match:d.match,notes:d.original_status}});
 }
 await db.query(`INSERT INTO web_workshop_visits(id,equipment_id,workshop_id,entered_at,exited_at,expected_at,stage,notes,created_by,updated_by,source)
 SELECT id,equipment_id,workshop_id,entered_at,exited_at,expected_at,stage,notes,'Importação da planilha','Importação da planilha',source FROM jsonb_to_recordset($1) AS r(id uuid,equipment_id bigint,workshop_id bigint,entered_at timestamptz,exited_at timestamptz,expected_at date,stage text,notes text,source jsonb)`,[JSON.stringify(visits)]);
 for(const r of rows.filter(r=>r.external&&!r.reason&&!imported.has(r.id))){
  const d=r.document,candidates=existing.filter(v=>v.equipment_id===d.equipmentId&&new Date(v.entered_at).getTime()<=Date.parse(at(d.entered))&&(!v.exited_at||new Date(v.exited_at).getTime()>=Date.parse(at(d.entered))));
  if(candidates.length!==1 || (!d.exited&&candidates[0].exited_at)){updates.push({id:r.id,reason:'Envio sem uma única entrada de oficina compatível com a máquina e as datas'});continue;}
  const visit=candidates[0].id;
  external.push({id:randomUUID(),visit_id:visit,component:d.component,supplier:d.supplier||'Não informado na planilha',sent_at:at(d.entered),expected_at:d.expected,returned_at:d.exited?at(d.exited):null,notes:d.notes+'\nSituação original: '+d.original_status});
  events.push({visit_id:visit,action:'Conserto externo importado',document:{sheet:r.sheet,row:r.row,notes:d.component}});updates.push({id:r.id,visit_id:visit});
 }
 await db.query(`INSERT INTO web_workshop_external(id,visit_id,component,supplier,sent_at,expected_at,returned_at,notes,created_by)
 SELECT id,visit_id,component,supplier,sent_at,expected_at,returned_at,notes,'Importação da planilha' FROM jsonb_to_recordset($1) AS r(id uuid,visit_id uuid,component text,supplier text,sent_at timestamptz,expected_at date,returned_at timestamptz,notes text)`,[JSON.stringify(external)]);
 await db.query(`INSERT INTO web_workshop_events(visit_id,action,actor,document) SELECT visit_id,action,'Sistema',document FROM jsonb_to_recordset($1) AS r(visit_id uuid,action text,document jsonb)`,[JSON.stringify(events)]);
 await db.query(`UPDATE web_workshop_imports i SET state=CASE WHEN r.visit_id IS NOT NULL THEN 'imported' ELSE 'pending' END,visit_id=r.visit_id,reason=r.reason FROM jsonb_to_recordset($1) AS r(id text,visit_id uuid,reason text) WHERE i.id=r.id`,[JSON.stringify(updates)]);
 await db.query('COMMIT');
 const pending=(await db.query("SELECT sheet,row_number,document,reason FROM web_workshop_imports WHERE state='pending' ORDER BY sheet,row_number")).rows;
 const csv=(v:any)=>'"'+String(v??'').replace(/"/g,'""')+'"';
 writeFileSync('artifacts/workshop-import-pendencias.csv','\ufeffAba;Linha;Equipamento;Situação original;Motivo\n'+pending.map(r=>[r.sheet,r.row_number,r.document.equipment_description,r.document.original_status,r.reason].map(csv).join(';')).join('\n'));
 console.log(JSON.stringify((await db.query('SELECT sheet,state,count(*)::int count FROM web_workshop_imports GROUP BY sheet,state ORDER BY sheet,state')).rows));
} catch(e){await db.query('ROLLBACK');throw e;}finally{await db.end();}
