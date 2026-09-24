import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID, createHash } from "node:crypto";
import { Client } from "pg";
import {
  parsePlan,
  parseOperating,
  emptyOperating,
  preventiveMonths,
} from "../lib/equipment-management/planning";
const dir = new URL("../../.m8/spreadsheet-preventives/", import.meta.url);
const input = readFileSync(new URL("prepared.json", dir), "utf8"),
  data = JSON.parse(input),
  snapshot = JSON.parse(readFileSync(new URL("current.json", dir), "utf8"));
const orders = JSON.parse(readFileSync(new URL("m8-orders.json", dir), "utf8"));
const apply = process.argv.includes("--apply"),
  batch = randomUUID(),
  digest = createHash("sha256").update(input).digest("hex");
const report: any = {
  batch,
  digest,
  apply,
  settings: [],
  plans: [],
  pending: [...data.pending],
  excluded: data.excluded,
};
const source = (r: any) =>
  `Planilha ${r.file === "rj" ? "GRUPO RJ" : "Serrana - Criciuma"}, aba ${r.sheet}, linha ${r.row}`;
const evidence = (r: any) =>
  `${source(r)}. Condição original: ${r.condition}. ${r.situation}`;
const eqs = new Map(snapshot.equipment.map((e: any) => [e.id, e]));
const rows = data.rows;
const iliot = JSON.parse(
  readFileSync(
    new URL("../../.m8/iliot-readings/prepared.json", import.meta.url),
    "utf8",
  ),
).candidates;
for (const eid of new Set<string>(rows.map((r: any) => r.equipment_id))) {
  const eq: any = eqs.get(eid),
    rs = rows.filter((r: any) => r.equipment_id === eid),
    existing = snapshot.plans.filter((p: any) => p.equipment_id === eid);
  const measurements: any[] = [];
  for (const r of rs)
    for (const reading of r.readings || [])
      measurements.push({
        date: reading.date,
        meter: reading.meter,
        source: source(r),
      });
  const old = eq.document;
  const validated = iliot.find(
    (c: any) =>
      c.equipment_id === eid &&
      c.latest.date === old?.meterDate &&
      c.latest.meter === old?.meter,
  );
  if (validated)
    for (const r of validated.previous)
      measurements.push({
        date: r.date,
        meter: r.meter,
        source: "Leitura anterior Iliot validada, OS " + r.os_number,
      });
  if (old?.meterDate && old.meter != null)
    measurements.push({
      date: old.meterDate,
      meter: old.meter,
      source: "Leitura real já cadastrada",
    });
  for (const p of existing)
    if (p.document.lastDate && p.document.lastMeter != null)
      measurements.push({
        date: p.document.lastDate,
        meter: p.document.lastMeter,
        source: "Intervenção cadastrada " + p.id,
      });
  const byDate = new Map<string, any[]>();
  for (const r of measurements)
    byDate.set(r.date, [...(byDate.get(r.date) || []), r]);
  const readings = [...byDate]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, rr]) => ({
      date,
      meter: rr[0].meter,
      source: rr[0].source,
      conflict: new Set(rr.map((r) => r.meter)).size > 1,
    }));
  const after = { ...emptyOperating, ...old };
  let settingsChanged = false;
  const latest = readings[0],
    previous = readings[1];
  if (latest?.conflict)
    report.pending.push({
      equipment_id: eid,
      reason: "leituras conflitantes na mesma data",
      readings,
    });
  if (
    latest &&
    !latest.conflict &&
    (!after.meterDate || latest.date > after.meterDate)
  ) {
    after.meter = latest.meter;
    after.meterDate = latest.date;
    settingsChanged = true;
    after.notes = [
      after.notes,
      `Leitura real: ${latest.meter} h em ${latest.date}. ${latest.source}.`,
    ]
      .filter(Boolean)
      .join("\n");
    if (old?.meter != null && latest.meter < old.meter) {
      report.pending.push({
        equipment_id: eid,
        reason: "redução do horímetro; registrada para revisão",
        before: old.meter,
        latest,
      });
      after.notes += " Revisar: leitura mais recente menor que a anterior.";
    }
  }
  const rate =
    latest && previous && !latest.conflict && !previous.conflict
      ? (latest.meter - previous.meter) /
        ((Date.parse(latest.date) - Date.parse(previous.date)) / 86400000)
      : null;
  const defaultRoutine =
    !old?.hoursDay ||
    !old?.daysYear ||
    /padrao autorizado|padrão autorizado/i.test(old?.notes || "");
  if (defaultRoutine) {
    const estimate =
      eq.family !== "3" && rate != null && rate > 0 && rate <= 24;
    const hd = estimate
        ? Math.round(rate! * 1000) / 1000
        : (old?.hoursDay ?? 24),
      dy = old?.daysYear ?? 365;
    if (after.hoursDay !== hd || after.daysYear !== dy) {
      after.hoursDay = hd;
      after.daysYear = dy;
      settingsChanged = true;
      after.notes +=
        "\n" +
        (estimate
          ? `Operação estimada entre ${previous.date} (${previous.meter} h) e ${latest.date} (${latest.meter} h): ${hd} h/dia corrido, base equivalente 365 dias/ano.`
          : "Operação: padrão autorizado de 24 h/dia e 365 dias/ano nos campos sem informação.");
    }
  }
  if (rate != null && (rate < 0 || rate > 24))
    report.pending.push({
      equipment_id: eid,
      reason: "taxa inválida para estimar operação",
      latest,
      previous,
      rate,
    });
  if (settingsChanged) {
    if (after.notes.length > 3000) {
      report.pending.push({
        equipment_id: eid,
        reason: "observações excedem limite; operação não alterada",
      });
    } else
      report.settings.push({
        equipment_id: eid,
        before: old,
        after: parseOperating(after),
        version: eq.version,
        evidence: rs,
        readings,
      });
  }
  const targets = new Map<string, any[]>();
  for (const r of rs) {
    const keys = r.hours.length
      ? r.hours.map((h: number) => "h" + h)
      : r.months
        ? ["m" + r.months]
        : [];
    for (const k of keys) targets.set(k, [...(targets.get(k) || []), r]);
  }
  // Include existing smaller plans in escalation even if absent from the spreadsheet.
  for (const p of existing.filter((p: any) => !p.archived && p.document.hours))
    if (rs.some((r: any) => r.hours.some((h: number) => h >= p.document.hours)))
      targets.set(
        "h" + p.document.hours,
        targets.get("h" + p.document.hours) || [],
      );
  for (const [key, evidences] of targets) {
    const hours = key[0] === "h" ? Number(key.slice(1)) : null,
      months = hours ? preventiveMonths(hours) : Number(key.slice(1));
    const matches = existing.filter((p: any) =>
      hours
        ? p.document.hours === hours
        : !p.document.hours && p.document.months === months,
    );
    if (matches.length > 1 || matches.some((p: any) => p.archived)) {
      report.pending.push({
        equipment_id: eid,
        interval: key,
        reason: "plano duplicado ou arquivado preservado",
      });
      continue;
    }
    const p = matches[0];
    const before = p?.document || null;
    const next = before
      ? structuredClone(before)
      : {
          name: hours
            ? `Preventiva ${hours.toLocaleString("pt-BR")} horas`
            : `Preventiva ${months} meses`,
          hours,
          months,
          lastDate: "",
          lastMeter: null,
          lastOrder: "",
          notes: "",
          items: [],
        };
    if (months) next.months = months;
    const interventions = rs
      .filter(
        (r: any) =>
          r.lastDate &&
          (hours
            ? r.hours.some((h: number) => h >= hours)
            : !r.hours.length && r.months === months),
      )
      .sort((a: any, b: any) => b.lastDate.localeCompare(a.lastDate));
    const last = interventions[0];
    if (last) {
      const peers = interventions.filter(
        (r: any) => r.lastDate === last.lastDate,
      );
      const meters = [
        ...new Set(
          peers
            .filter((r: any) => r.meterDate === r.lastDate && r.meter != null)
            .map((r: any) => r.meter),
        ),
      ];
      const meter = meters.length === 1 ? meters[0] : null;
      const refs = [
        ...new Set(
          peers
            .flatMap((r: any) => r.order_mentions)
            .map((x: string) => x.replaceAll(".", "")),
        ),
      ];
      const os = orders.filter(
        (o: any) =>
          refs.includes(String(o.number || o.id)) &&
          (o.equipment_id === eid || o.linked.includes(eid)) &&
          [o.data_entrega, o.emissao, o.data_abertura].some(
            (d) => d?.slice(0, 10) === last.lastDate,
          ),
      );
      const order = os.length === 1 ? String(os[0].number || os[0].id) : "";
      const meterConflict =
        meters.length > 1 ||
        (meter != null &&
          next.lastMeter != null &&
          last.lastDate >= next.lastDate &&
          (Number(meter) < next.lastMeter ||
            (last.lastDate === next.lastDate &&
              Number(meter) !== next.lastMeter)));
      if (meterConflict)
        report.pending.push({
          equipment_id: eid,
          interval: key,
          reason:
            "horímetro da intervenção divergente; intervenção existente preservada",
          meter,
          previous: next.lastMeter,
          source: source(last),
        });
      if (!meterConflict && (!next.lastDate || last.lastDate > next.lastDate)) {
        next.lastDate = last.lastDate;
        next.lastMeter = meter;
        next.lastOrder = order;
      } else if (!meterConflict && last.lastDate === next.lastDate) {
        if (next.lastMeter == null) next.lastMeter = meter;
        if (!next.lastOrder) next.lastOrder = order;
      }
      if (refs.length && !order)
        report.pending.push({
          equipment_id: eid,
          interval: key,
          reason: "OS citada sem correspondência única de equipamento e data",
          refs,
          source: source(last),
        });
    }
    if (!before || JSON.stringify(next) !== JSON.stringify(before)) {
      const r = last || evidences[0];
      const memo = r ? evidence(r) : "Escalonamento da revisão maior";
      next.notes = [next.notes, memo].filter(Boolean).join("\n");
      if (next.notes.length > 3000) {
        report.pending.push({
          equipment_id: eid,
          interval: key,
          reason: "observações excedem limite; plano não alterado",
        });
        continue;
      }
      report.plans.push({
        id: p?.id || randomUUID(),
        equipment_id: eid,
        before,
        after: parsePlan(next),
        version: p?.version,
        evidence: evidences,
        intervention: last || null,
      });
    }
  }
}
const out = new URL(`import-${batch}.json`, dir);
writeFileSync(out, JSON.stringify({ ...report, state: "prepared" }, null, 2), {
  mode: 0o600,
});
if (apply) {
  const db = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: true,
      ca: readFileSync(
        new URL("../certs/supabase-ca.crt", import.meta.url),
        "utf8",
      ),
    },
  });
  try {
    await db.connect();
    await db.query("BEGIN");
    await db.query(
      "LOCK TABLE web_equipment_settings,web_equipment_plans IN SHARE ROW EXCLUSIVE MODE",
    );
    for (const eid of new Set(
      [...report.settings, ...report.plans].map((r: any) => r.equipment_id),
    )) {
      const current = (
        await db.query(
          "SELECT serial,present FROM m8_equipment_catalog WHERE equipment_id=$1 FOR SHARE",
          [eid],
        )
      ).rows[0];
      const expected: any = eqs.get(eid);
      if (!current?.present || current.serial !== expected.serial)
        throw Error("Equipamento alterado desde a análise");
    }
    for (const r of report.settings) {
      const now = (
        await db.query(
          "SELECT document,version FROM web_equipment_settings WHERE equipment_id=$1",
          [r.equipment_id],
        )
      ).rows[0];
      if ((now?.version || null) !== (r.version || null))
        throw Error("Configuração modificada desde a análise");
      await db.query(
        `INSERT INTO web_equipment_settings(equipment_id,document,updated_by) VALUES($1,$2,'importacao:planilhas') ON CONFLICT(equipment_id) DO UPDATE SET document=EXCLUDED.document,updated_at=now(),updated_by=EXCLUDED.updated_by,version=web_equipment_settings.version+1`,
        [r.equipment_id, JSON.stringify(r.after)],
      );
    }
    for (const r of report.plans) {
      if (r.before) {
        const res = await db.query(
          `UPDATE web_equipment_plans SET document=$2,version=version+1,updated_at=now(),updated_by='importacao:planilhas' WHERE id=$1 AND version=$3 AND NOT archived`,
          [r.id, JSON.stringify(r.after), r.version],
        );
        if (res.rowCount !== 1) throw Error("Plano modificado desde a análise");
      } else {
        const current = (
          await db.query(
            "SELECT document FROM web_equipment_plans WHERE equipment_id=$1",
            [r.equipment_id],
          )
        ).rows;
        if (
          current.some((p) =>
            r.after.hours
              ? p.document.hours === r.after.hours
              : !p.document.hours && p.document.months === r.after.months,
          )
        )
          throw Error("Plano concorrente");
        await db.query(
          `INSERT INTO web_equipment_plans(id,equipment_id,document,updated_by) VALUES($1,$2,$3,'importacao:planilhas')`,
          [r.id, r.equipment_id, JSON.stringify(r.after)],
        );
      }
    }
    for (const [kind, changes] of [
      ["settings", report.settings],
      ["plan", report.plans],
    ] as const)
      for (const r of changes)
        await db.query(
          `INSERT INTO web_equipment_events(equipment_id,plan_id,kind,document,created_by,display_name) VALUES($1,$2,$3,$4,'importacao:planilhas','Importação das planilhas de manutenção')`,
          [
            r.equipment_id,
            r.id || null,
            kind,
            JSON.stringify({
              ...r,
              batch,
              digest,
              source: "maintenance-spreadsheets",
            }),
          ],
        );
    await db.query("COMMIT");
    report.state = "committed";
  } catch (e) {
    await db.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    await db.end();
  }
} else report.state = "dry-run";
writeFileSync(out, JSON.stringify(report, null, 2), { mode: 0o600 });
console.log(
  JSON.stringify({
    batch,
    state: report.state,
    settings: report.settings.length,
    newPlans: report.plans.filter((r: any) => !r.before).length,
    updatedPlans: report.plans.filter((r: any) => r.before).length,
    pending: report.pending.length,
    report: out.pathname,
  }),
);
