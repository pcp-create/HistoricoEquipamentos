import {Client} from 'pg';
import {readFileSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {parsePlan} from '../lib/equipment-management/planning';
const evidence=JSON.parse(readFileSync(new URL('../../.m8/preventive-research/last-intervention-candidates.json',import.meta.url),'utf8'));
const apply=process.argv.includes('--apply'),batch=randomUUID();
const db=new Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:true,ca:readFileSync(new URL('../certs/supabase-ca.crt',import.meta.url),'utf8')},statement_timeout:120000});
const report:any={batch,apply,updated:[],skipped:[]};
try {
 await db.connect();await db.query('BEGIN');await db.query('LOCK TABLE web_equipment_plans IN SHARE ROW EXCLUSIVE MODE');
 const plans=(await db.query(`SELECT p.id,p.equipment_id::text equipment,p.document FROM web_equipment_plans p JOIN m8_equipment_catalog e ON e.equipment_id=p.equipment_id WHERE NOT p.archived AND e.present`)).rows;
 for(const p of plans){
  if(p.document.lastDate || p.document.lastMeter != null || p.document.lastOrder){report.skipped.push({id:p.id,equipment:p.equipment,reason:'intervenção existente preservada'});continue;}
  const e=evidence.find((e:any)=>e.equipment_id===p.equipment&&e.hours===Number(p.document.hours));
  if(!e){report.skipped.push({id:p.id,equipment:p.equipment,hours:p.document.hours,reason:'sem evidência de execução inequívoca'});continue;}
  const current=(await db.query(`SELECT o.status,o.tipo_atendimento_nome,o.observacao,(COALESCE(o.data_entrega,o.emissao,o.data_abertura) AT TIME ZONE 'UTC')::date::text date,s.finalized,s.pending FROM m8_ordens_servico o JOIN integracao_m8_os_sync s ON s.company_id=o.company_id AND s.ordem_servico_id=o.id_m8 WHERE o.company_id=$1 AND o.id_m8=$2 AND (o.produto_equipamento_id=$3 OR EXISTS(SELECT 1 FROM m8_equipment_linked l WHERE l.company_id=o.company_id AND l.order_id=o.id_m8 AND l.equipment_id=$3))`,[e.company,e.order_id,p.equipment])).rows[0];
  if(!current||current.status!=='Processado'||!current.finalized||current.pending||current.date!==e.date||current[e.source==='observacao'?'observacao':'tipo_atendimento_nome']!==e.source_text||e.date>new Date().toISOString().slice(0,10)){report.skipped.push({id:p.id,equipment:p.equipment,reason:'fonte não confirmada na revalidação',evidence:e});continue;}
  const after=parsePlan({...p.document,lastDate:e.date,lastOrder:String(e.order_id),notes:`${p.document.notes}\nÚltima intervenção preenchida com evidência de execução: OS ${e.order_number} (ID ${e.order_id}), empresa ${e.company}. Data de referência: ${e.date_source}. ${e.source}: ${e.excerpt}. Horímetro da intervenção não inferido da leitura atual.`});
  report.updated.push({id:p.id,equipment:p.equipment,before:p.document,after,evidence:e});
 }
 const path=new URL(`../../.m8/preventive-research/last-interventions-${batch}.json`,import.meta.url);
 writeFileSync(path,JSON.stringify({...report,state:'prepared'},null,2),{mode:0o600});
 if(apply)for(const r of report.updated){
  await db.query(`UPDATE web_equipment_plans SET document=$2,version=version+1,updated_at=now(),updated_by='importacao:ultimas-intervencoes-m8' WHERE id=$1`,[r.id,JSON.stringify(r.after)]);
  await db.query(`INSERT INTO web_equipment_events(equipment_id,plan_id,kind,document,created_by,display_name) VALUES($1,$2,'plan',$3,'importacao:ultimas-intervencoes-m8','Preenchimento das últimas intervenções M8')`,[r.equipment,r.id,JSON.stringify({...r,batch})]);
 }
 await db.query(apply?'COMMIT':'ROLLBACK');
 writeFileSync(path,JSON.stringify({...report,state:apply?'committed':'dry-run'},null,2),{mode:0o600});
 const reasons:Record<string,number>={};for(const r of report.skipped)reasons[r.reason]=(reasons[r.reason]||0)+1;
 console.log(JSON.stringify({batch,apply,checked:plans.length,updated:report.updated.length,equipment:new Set(report.updated.map((r:any)=>r.equipment)).size,reasons,report:path.pathname}));
} catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}finally{await db.end();}
