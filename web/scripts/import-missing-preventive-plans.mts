import {Client} from 'pg';
import {readFileSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {parsePlan} from '../lib/equipment-management/planning';
const candidates=JSON.parse(readFileSync(new URL('../../.m8/preventive-research/plan-candidates.json',import.meta.url),'utf8'));
const apply=process.argv.includes('--apply'),batch=randomUUID();
const db=new Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:true,ca:readFileSync(new URL('../certs/supabase-ca.crt',import.meta.url),'utf8')},statement_timeout:120000});
const result:any={batch,apply,created:[],skipped:[]};
try{
 await db.connect();await db.query('BEGIN');await db.query('LOCK TABLE web_equipment_plans IN SHARE ROW EXCLUSIVE MODE');
 const existing=(await db.query('SELECT equipment_id::text AS id,document FROM web_equipment_plans')).rows;
 const present=new Set((await db.query('SELECT equipment_id::text AS id FROM m8_equipment_catalog WHERE present')).rows.map(r=>r.id));
 const orders=(await db.query(`SELECT company_id,id_m8::text AS id,status,tipo_atendimento_nome,observacao,produto_equipamento_id::text AS installed FROM m8_ordens_servico WHERE company_id IN(1,2,27404)`)).rows;
 const byOrder=new Map(orders.map(r=>[r.company_id+':'+r.id,r]));
 const links=new Set((await db.query('SELECT equipment_id::text AS id,company_id,order_id::text FROM m8_equipment_linked')).rows.map(r=>r.id+':'+r.company_id+':'+r.order_id));
 for(const candidate of candidates){
  const id=candidate.equipment_id,e=candidate.evidence,o=byOrder.get(e.company+':'+e.order_id);
  if(existing.some(p=>p.id===id&&Number(p.document.hours)===candidate.hours)){result.skipped.push({id,hours:candidate.hours,reason:'plano existente preservado'});continue;}
  if(!present.has(id)||!o||!['Pendente','Processado'].includes(o.status)||(o.installed!==id&&!links.has(id+':'+e.company+':'+e.order_id))||o[e.source==='observacao'?'observacao':'tipo_atendimento_nome']!==e.source_text){result.skipped.push({id,hours:candidate.hours,reason:'fonte ou vínculo alterado'});continue;}
  const baseline=!e.review && o.status==='Processado';
  const document=parsePlan({name:`Preventiva ${candidate.hours.toLocaleString('pt-BR')} horas`,hours:candidate.hours,months:null,lastMeter:null,lastDate:baseline?e.date:'',lastOrder:baseline?String(e.order_id):'',notes:`Cadastro de preventiva baseado na OS M8 ${e.order_number} (ID ${e.order_id}), empresa ${e.company}. Origem: ${e.source}. Trecho: ${e.excerpt}. ${baseline?'Última data de referência: '+e.date_source+'.':'Não confirma execução deste intervalo; última intervenção ainda não atribuída.'} ${e.reason?'Conferência: '+e.reason+'.':''} Intervalos alternativos mencionados no mesmo grupo são cadastrados separadamente; conferir aplicação do plano à máquina. Não foram alterados horímetros ou rotina operacional.`});
  result.created.push({id:randomUUID(),equipment_id:id,document,evidence:e});
 }
 const path=new URL(`../../.m8/preventive-research/missing-plans-${batch}.json`,import.meta.url);
 writeFileSync(path,JSON.stringify({...result,state:'prepared'},null,2),{mode:0o600});
 if(apply){
  await db.query(`INSERT INTO web_equipment_plans(id,equipment_id,document,updated_by) SELECT x.id,x.equipment_id,x.document,'importacao:preventivas-complementares' FROM jsonb_to_recordset($1::jsonb) x(id uuid,equipment_id bigint,document jsonb)`,[JSON.stringify(result.created)]);
  await db.query(`INSERT INTO web_equipment_events(equipment_id,plan_id,kind,document,created_by,display_name) SELECT x.equipment_id,x.id,'plan',jsonb_build_object('before',null,'after',x.document,'batch',$2::text,'evidence',x.evidence),'importacao:preventivas-complementares','Cadastro complementar de preventivas autorizado' FROM jsonb_to_recordset($1::jsonb) x(id uuid,equipment_id bigint,document jsonb,evidence jsonb)`,[JSON.stringify(result.created),batch]);
 }
 await db.query(apply?'COMMIT':'ROLLBACK');writeFileSync(path,JSON.stringify({...result,state:apply?'committed':'dry-run'},null,2),{mode:0o600});
 console.log(JSON.stringify({batch,apply,plans:result.created.length,equipment:new Set(result.created.map((r:any)=>r.equipment_id)).size,skipped:result.skipped.length,target:result.created.filter((r:any)=>r.equipment_id==='22445').map((r:any)=>r.document),report:path.pathname}));
}catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}finally{await db.end();}
