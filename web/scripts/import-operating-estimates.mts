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
 const current=(await db.query(`SELECT e.equipment_id::text AS id,e.payload->>'familiaId'='3' AS rental,s.document,s.version FROM m8_equipment_catalog e LEFT JOIN web_equipment_settings s USING(equipment_id) WHERE e.present`)).rows;
 const candidates=new Map<string,any>(data.candidates.map((r:any)=>[r.equipment_id,r]));
 for(const currentRow of current){
  const id=currentRow.id,old=currentRow.document;
  if(old?.hoursDay!=null && old?.daysYear!=null){result.skipped.push({equipment_id:id,reason:'rotina existente preservada'});continue;}
  const candidate=candidates.get(id);
  const rate=candidate?.calendar_hours_day;
  const canEstimate=!currentRow.rental && old?.hoursDay==null && old?.daysYear==null &&
    Number.isFinite(rate) && rate>=0.001 && rate<=24 &&
    Number(old?.meter)===candidate.latest.meter && old?.meterDate===candidate.latest.date;
  const hoursDay=old?.hoursDay ?? (canEstimate?Math.round(rate*1000)/1000:24);
  const daysYear=old?.daysYear ?? 365;
  const reason=canEstimate?'media_calendario':'padrao_autorizado';
  const note=canEstimate
    ? `Operação estimada entre leituras Iliot: ${hoursDay} h/dia corrido, base equivalente de 365 dias/ano (não é jornada medida).`
    : `Operação: campos pendentes preenchidos com padrão autorizado de 24 h/dia e 365 dias/ano; sem estimativa suficiente de atividade. Rotina previamente preenchida preservada.`;
  const notes=[old?.notes,note].filter(Boolean).join('\n');
  if(notes.length>3000)throw new Error('Observações excedem limite para equipamento '+id);
  const after=parseOperating({...emptyOperating,...old,hoursDay,daysYear,notes});
  result.changes.push({equipment_id:id,before:old||null,after,previous_version:currentRow.version||null,evidence:{reason,rental:currentRow.rental,latest:canEstimate?candidate.latest:null,previous:canEstimate?candidate.previous:null}});
 }
 const out=new URL(`../../.m8/iliot-readings/operation-${batch}.json`,import.meta.url);
 writeFileSync(out,JSON.stringify({...result,state:'prepared'},null,2),{mode:0o600});
 if(apply){
  await db.query(`INSERT INTO web_equipment_settings(equipment_id,document,updated_by)
   SELECT x.equipment_id,x.after,'importacao:operacao-estimada' FROM jsonb_to_recordset($1::jsonb) x(equipment_id bigint,after jsonb)
   ON CONFLICT(equipment_id) DO UPDATE SET document=EXCLUDED.document,updated_at=now(),updated_by=EXCLUDED.updated_by,version=web_equipment_settings.version+1`,[JSON.stringify(result.changes)]);
  await db.query(`INSERT INTO web_equipment_events(equipment_id,kind,document,created_by,display_name)
   SELECT x.equipment_id,'settings',jsonb_build_object('before',x.before,'after',x.after,'source','operating-estimate','batch',$2::text,'digest',$3::text,'evidence',x.evidence),'importacao:operacao-estimada','Estimativa de operação e padrão autorizado'
   FROM jsonb_to_recordset($1::jsonb) x(equipment_id bigint,before jsonb,after jsonb,evidence jsonb)`,[JSON.stringify(result.changes),batch,result.digest]);
 }
 await db.query(apply?'COMMIT':'ROLLBACK');
 writeFileSync(out,JSON.stringify({...result,state:apply?'committed':'dry-run'},null,2),{mode:0o600});
 console.log(JSON.stringify({batch,apply,equipment:result.changes.length,estimated:result.changes.filter((r:any)=>r.evidence.reason==='media_calendario').length,defaults:result.changes.filter((r:any)=>r.evidence.reason==='padrao_autorizado').length,skipped:result.skipped.length,report:out.pathname}));
}catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}finally{await db.end();}
