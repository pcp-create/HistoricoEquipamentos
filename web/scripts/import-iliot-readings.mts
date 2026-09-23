import { Client } from 'pg';
import { readFileSync,writeFileSync } from 'node:fs';
import { randomUUID,createHash } from 'node:crypto';
import { emptyOperating,parseOperating } from '../lib/equipment-management/planning';
const raw=readFileSync(new URL('../../.m8/iliot-readings/prepared.json',import.meta.url),'utf8');
const data=JSON.parse(raw),batch=randomUUID(),apply=process.argv.includes('--apply');
const result:any={batch,apply,digest:createHash('sha256').update(raw).digest('hex'),changes:[],skipped:[]};
const db=new Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:true,ca:readFileSync(new URL('../certs/supabase-ca.crt',import.meta.url),'utf8')},statement_timeout:120000});
try {
 await db.connect();await db.query('BEGIN');
 await db.query('LOCK TABLE web_equipment_settings,web_equipment_plans IN SHARE ROW EXCLUSIVE MODE');
 const current=(await db.query(`SELECT e.equipment_id::text AS id,s.document,s.version FROM m8_equipment_catalog e LEFT JOIN web_equipment_settings s USING(equipment_id) WHERE e.present`)).rows;
 const byId=new Map(current.map(r=>[r.id,r]));
 const plans=(await db.query('SELECT equipment_id::text AS id,document FROM web_equipment_plans WHERE NOT archived')).rows;
 for(const candidate of data.candidates){
  const id=candidate.equipment_id,r=candidate.latest,current=byId.get(id),old=current?.document;
  let reason='';
  const warnings: string[] = [...(candidate.warnings || [])];
  if(!current)reason='equipamento não presente no M8';
  else if(old?.meterDate && old.meterDate>=r.date)reason='leitura existente na mesma data ou mais recente';
  if(old?.meter!=null && Number(old.meter)>r.meter)warnings.push('Revisar: leitura importada inferior à cadastrada anteriormente.');
  if(plans.some(p=>p.id===id&&p.document.lastDate<=r.date&&p.document.lastMeter!=null&&p.document.lastMeter>r.meter))warnings.push('Revisar: leitura inferior ao horímetro da última intervenção do plano.');
  if(reason){result.skipped.push({equipment_id:id,reason});continue;}
  const note=`Leitura Iliot importada: OS ${r.os_number} (ID ${r.os_id}), item ${r.item_id}, ${r.field}; data do checklist ${r.date}; vínculo: ${r.method}.`+
    (candidate.calendar_hours_day!=null?` Média estimada entre leituras: ${candidate.calendar_hours_day.toFixed(3)} h/dia corrido; não define jornada ou dias de operação/ano.`:'');
  const notes=[old?.notes,note,...warnings].filter(Boolean).join('\n');
  if(notes.length>3000){result.skipped.push({equipment_id:id,reason:'observações excederiam limite; preservado'});continue;}
  const after=parseOperating({...emptyOperating,...old,meter:r.meter,meterDate:r.date,notes});
  result.changes.push({equipment_id:id,before:old||null,after,previous_version:current?.version||null,evidence:{...candidate,warnings}});
 }
 const out=new URL(`../../.m8/iliot-readings/import-${batch}.json`,import.meta.url);
 writeFileSync(out,JSON.stringify({...result,state:'prepared'},null,2),{mode:0o600});
 if(apply){
  await db.query(`INSERT INTO web_equipment_settings(equipment_id,document,updated_by)
   SELECT x.equipment_id,x.after,'importacao:iliot-horimetros' FROM jsonb_to_recordset($1::jsonb) x(equipment_id bigint,after jsonb)
   ON CONFLICT(equipment_id) DO UPDATE SET document=EXCLUDED.document,updated_at=now(),updated_by=EXCLUDED.updated_by,version=web_equipment_settings.version+1`,[JSON.stringify(result.changes)]);
  await db.query(`INSERT INTO web_equipment_events(equipment_id,kind,document,created_by,display_name)
   SELECT x.equipment_id,'settings',jsonb_build_object('before',x.before,'after',x.after,'source','iliot-readings','batch',$2::text,'digest',$3::text,'evidence',x.evidence),'importacao:iliot-horimetros','Importação de horímetros Iliot validada'
   FROM jsonb_to_recordset($1::jsonb) x(equipment_id bigint,before jsonb,after jsonb,evidence jsonb)`,[JSON.stringify(result.changes),batch,result.digest]);
 }
 await db.query(apply?'COMMIT':'ROLLBACK');
 writeFileSync(out,JSON.stringify({...result,state:apply?'committed':'dry-run'},null,2),{mode:0o600});
 console.log(JSON.stringify({batch,apply,equipment:result.changes.length,skipped:result.skipped,report:out.pathname}));
}catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}finally{await db.end();}
