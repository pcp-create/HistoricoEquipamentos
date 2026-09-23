import { Client } from 'pg';
import { readFileSync, writeFileSync } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import { parsePlan } from '../lib/equipment-management/planning';
const source = new URL('../../.m8/preventive-research/equipment-report.json', import.meta.url);
const raw = readFileSync(source, 'utf8');
const report = JSON.parse(raw);
const digest = createHash('sha256').update(raw).digest('hex');
const apply = process.argv.includes('--apply');
const db = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: true, ca: readFileSync(new URL('../certs/supabase-ca.crt', import.meta.url), 'utf8') }, statement_timeout: 120000 });
const batch = randomUUID();
const result: any = { batch, digest, apply, created: [], existing: [], excluded: [] };
try {
  await db.connect();
  await db.query('BEGIN');
  // Serializes the duplicate check with normal inserts/updates of preventive plans.
  await db.query('LOCK TABLE web_equipment_plans IN SHARE ROW EXCLUSIVE MODE');
  for (const equipment of report) {
    for (const interval of equipment.intervals) {
      const evidence = interval.latest;
      if (!evidence || evidence.review) continue;
      const id = String(equipment.id);
      const existing = await db.query(`SELECT id,archived FROM web_equipment_plans WHERE equipment_id=$1 AND document->>'hours' IS NOT NULL AND (document->>'hours')::numeric=$2`, [id, interval.hours]);
      if (existing.rows.length) { result.existing.push({ equipment: id, hours: interval.hours, plans: existing.rows }); continue; }
      const current = await db.query(`SELECT o.status,o.tipo_atendimento_nome,o.observacao,
        (COALESCE(o.data_entrega,o.emissao,o.data_abertura) AT TIME ZONE 'UTC')::date::text AS date,
        s.finalized,s.pending FROM m8_ordens_servico o JOIN integracao_m8_os_sync s ON s.company_id=o.company_id AND s.ordem_servico_id=o.id_m8
        WHERE o.company_id=$1 AND o.id_m8=$2 AND EXISTS(SELECT 1 FROM m8_equipment_catalog e WHERE e.equipment_id=$3 AND e.present)
        AND (o.produto_equipamento_id=$3 OR EXISTS(SELECT 1 FROM m8_equipment_linked l WHERE l.company_id=o.company_id AND l.order_id=o.id_m8 AND l.equipment_id=$3))`, [evidence.company, evidence.order_id, id]);
      const order = current.rows[0];
      const field = evidence.source === 'observacao' ? 'observacao' : 'tipo_atendimento_nome';
      if (!order || order.status !== 'Processado' || !order.finalized || order.pending || order.date !== evidence.date || order[field] !== evidence.source_text) {
        result.excluded.push({ equipment: id, hours: interval.hours, reason: 'Fonte alterada ou vínculo/status não confirmado', evidence }); continue;
      }
      const plan = parsePlan({ name: `Preventiva ${Number(interval.hours).toLocaleString('pt-BR')} horas`, hours: interval.hours, months: null,
        lastDate: evidence.date, lastMeter: null, lastOrder: String(evidence.order_id),
        notes: `Importado do levantamento M8 validado pelo usuário. Empresa ${evidence.company}; OS ${evidence.order_number || evidence.order_id}; ID ${evidence.order_id}. Data de referência: ${evidence.date_source}. Origem: ${evidence.source}. Trecho: ${evidence.excerpt}. Horímetro e rotina operacional pendentes da próxima etapa.` });
      const planId = randomUUID();
      const record = { id: planId, equipment: id, document: plan, evidence };
      result.created.push(record);
      if (apply) {
        await db.query('INSERT INTO web_equipment_plans(id,equipment_id,document,updated_by) VALUES($1,$2,$3,$4)', [planId,id,JSON.stringify(plan),'importacao:preventivas-m8']);
        await db.query(`INSERT INTO web_equipment_events(equipment_id,plan_id,kind,document,created_by,display_name) VALUES($1,$2,'plan',$3,$4,$5)`, [id,planId,JSON.stringify({before:null,after:plan,intervention:null,source:'preventive-research',batch,digest,evidence}),'importacao:preventivas-m8','Importação de preventivas M8 validada']);
      }
    }
  }
  const out = new URL(`../../.m8/preventive-research/import-${batch}.json`, import.meta.url);
  writeFileSync(out,JSON.stringify({...result, state:'prepared'},null,2),{mode:0o600});
  await db.query(apply ? 'COMMIT' : 'ROLLBACK');
  writeFileSync(out,JSON.stringify({...result,state:apply?'committed':'dry-run'},null,2),{mode:0o600});
  console.log(JSON.stringify({batch,apply,plans:result.created.length,equipment:new Set(result.created.map((r:any)=>r.equipment)).size,existing:result.existing.length,excluded:result.excluded.length,report:out.pathname}));
} catch(error) { await db.query('ROLLBACK').catch(()=>{}); throw error; }
finally { await db.end(); }
