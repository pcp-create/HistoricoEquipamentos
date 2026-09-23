import { Client } from "pg";
import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import {
  parsePlan,
  preventiveMonths,
} from "../lib/equipment-management/planning";
const candidates = JSON.parse(
  readFileSync(
    new URL(
      "../../.m8/preventive-research/plan-completion-candidates.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const apply = process.argv.includes("--apply"),
  batch = randomUUID();
const db = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: true,
    ca: readFileSync(
      new URL("../certs/supabase-ca.crt", import.meta.url),
      "utf8",
    ),
  },
  statement_timeout: 120000,
});
const report: any = { batch, apply, updated: [], pending: [] };
try {
  await db.connect();
  await db.query("BEGIN");
  await db.query("LOCK TABLE web_equipment_plans IN SHARE ROW EXCLUSIVE MODE");
  const plans = (
    await db.query(
      `SELECT p.id,p.equipment_id::text equipment,p.document FROM web_equipment_plans p JOIN m8_equipment_catalog e ON e.equipment_id=p.equipment_id WHERE NOT p.archived AND e.present`,
    )
  ).rows;
  const orders = (
    await db.query(
      `SELECT o.id_m8::text id,o.company_id,o.produto_equipamento_id::text equipment_id,o.tipo_atendimento_nome,o.observacao,o.status,s.finalized,s.pending,o.data_entrega,o.emissao,o.data_abertura FROM m8_ordens_servico o JOIN integracao_m8_os_sync s ON s.company_id=o.company_id AND s.ordem_servico_id=o.id_m8 WHERE o.company_id IN(1,2,27404)`,
    )
  ).rows;
  const byOrder = new Map(orders.map((o) => [o.company_id + ":" + o.id, o]));
  const links = new Set(
    (
      await db.query(
        "SELECT equipment_id::text equipment,company_id,order_id::text id FROM m8_equipment_linked",
      )
    ).rows.map((r) => r.equipment + ":" + r.company_id + ":" + r.id),
  );
  const valid = candidates.filter((e: any) => {
    const o = byOrder.get(e.order.company_id + ":" + e.order.id);
    return (
      o &&
      o.status === "Processado" &&
      o.finalized &&
      !o.pending &&
      o.tipo_atendimento_nome === e.order.tipo_atendimento_nome &&
      o.observacao === e.order.observacao &&
      (o.equipment_id === e.equipment_id ||
        links.has(e.equipment_id + ":" + o.company_id + ":" + o.id)) &&
      ["data_entrega", "emissao", "data_abertura"].every(
        (k) => (o[k] ? new Date(o[k]).toISOString() : null) === e.order[k],
      )
    );
  });
  for (const p of plans) {
    const before = p.document,
      after = { ...before };
    after.months ??= preventiveMonths(after.hours);
    const matching = valid
      .filter(
        (e: any) =>
          e.equipment_id === p.equipment &&
          after.hours &&
          e.hours >= after.hours,
      )
      .sort(
        (a: any, b: any) =>
          b.date.localeCompare(a.date) ||
          Number(b.order.id) - Number(a.order.id),
      );
    const e = matching[0];
    let used = null;
    if (e && (!after.lastDate || e.date > after.lastDate)) {
      after.lastDate = e.date;
      after.lastMeter = e.meter;
      after.lastOrder = String(e.order.id);
      used = e;
    } else if (
      e &&
      e.date === after.lastDate &&
      (!after.lastOrder || after.lastOrder === String(e.order.id))
    ) {
      if (after.lastMeter == null && e.meter != null) {
        after.lastMeter = e.meter;
        used = e;
      }
      if (!after.lastOrder) {
        after.lastOrder = String(e.order.id);
        used = e;
      }
    }
    if (used) {
      const note = `Intervenção revisada: OS ${used.order.id}, empresa ${used.order.company_id}, ${used.date}, preventiva de ${used.hours} h; inclui intervalos menores. Horímetro: ${used.meter == null ? "sem leitura confirmada" : used.meter + " h (" + used.meter_source.kind + ")"}.`;
      after.notes = after.notes.replace(
        "Não confirma execução deste intervalo; última intervenção ainda não atribuída.",
        "Registro inicial complementado pela evidência de execução abaixo.",
      );
      if (after.notes.length + note.length + 1 <= 3000)
        after.notes += "\n" + note;
    }
    const document = parsePlan(after);
    if (
      Object.keys(document).some(
        (k) => before[k] !== document[k as keyof typeof document],
      )
    )
      report.updated.push({
        id: p.id,
        equipment: p.equipment,
        before,
        after: document,
        evidence: used,
      });
    if (
      !document.lastDate ||
      document.lastMeter == null ||
      !document.lastOrder ||
      !document.months
    )
      report.pending.push({
        id: p.id,
        equipment: p.equipment,
        hours: document.hours,
        missing: ["lastDate", "lastMeter", "lastOrder", "months"].filter(
          (k) =>
            document[k as keyof typeof document] == null ||
            document[k as keyof typeof document] === "",
        ),
      });
  }
  const path = new URL(
    `../../.m8/preventive-research/plan-completion-${batch}.json`,
    import.meta.url,
  );
  writeFileSync(
    path,
    JSON.stringify({ ...report, state: "prepared" }, null, 2),
    { mode: 0o600 },
  );
  if (apply) {
    await db.query(
      `UPDATE web_equipment_plans p SET document=x.after,version=p.version+1,updated_at=now(),updated_by='importacao:complementacao-planos' FROM jsonb_to_recordset($1::jsonb) x(id uuid,after jsonb) WHERE p.id=x.id`,
      [JSON.stringify(report.updated)],
    );
    await db.query(
      `INSERT INTO web_equipment_events(equipment_id,plan_id,kind,document,created_by,display_name) SELECT x.equipment::bigint,x.id,'plan',jsonb_build_object('before',x.before,'after',x.after,'evidence',x.evidence,'batch',$2::text),'importacao:complementacao-planos','Complementação de preventivas e escalonamento' FROM jsonb_to_recordset($1::jsonb) x(id uuid,equipment text,before jsonb,after jsonb,evidence jsonb)`,
      [JSON.stringify(report.updated), batch],
    );
  }
  await db.query(apply ? "COMMIT" : "ROLLBACK");
  writeFileSync(
    path,
    JSON.stringify(
      { ...report, state: apply ? "committed" : "dry-run" },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  const fields = Object.fromEntries(
    ["months", "lastDate", "lastOrder", "lastMeter"].map((k) => [
      k,
      report.updated.filter((r: any) => r.before[k] !== r.after[k]).length,
    ]),
  );
  console.log(
    JSON.stringify({
      batch,
      apply,
      checked: plans.length,
      updated: report.updated.length,
      equipment: new Set(report.updated.map((r: any) => r.equipment)).size,
      fields,
      pending: report.pending.length,
      report: path.pathname,
    }),
  );
} catch (e) {
  await db.query("ROLLBACK").catch(() => {});
  throw e;
} finally {
  await db.end();
}
