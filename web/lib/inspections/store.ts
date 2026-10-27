import "server-only";
import { database } from "../db";
import { blankQuote, parseQuote } from "../quotes/types";
import { Forbidden } from "../auth";
import {
  InspectionInputError,
  InspectionConflict,
  inspectionForecast,
  collectionDate,
  validDate,
  brazilToday,
} from "./model";
export { InspectionInputError, InspectionConflict };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function inspectionAccess(c: any, email: string) {
  if (
    !(
      await c.query("SELECT enabled FROM web_user_access WHERE email=$1", [
        email.toLowerCase(),
      ])
    ).rows[0]?.enabled
  )
    throw new Forbidden();
}
function text(v: unknown, max: number, required = false) {
  if (typeof v !== "string" || v.trim().length > max || (required && !v.trim()))
    throw new InspectionInputError("Confira os campos da inspeção.");
  return v.trim();
}
function date(v: unknown, required = false) {
  if (!v && !required) return null;
  if (!validDate(v)) throw new InspectionInputError("Informe uma data válida.");
  return v;
}
export async function inspectionRows(c: any = database()) {
  const rows = (
    await c.query(`SELECT p.id::text,p.customer_person_id::text,p.customer_company_id,p.type_id::text,p.route_name,p.interval_value,p.interval_unit,p.notice_days,p.baseline_date::text,p.first_due::text,p.notes,p.active,p.version,t.name AS type_name,t.code AS type_code,
  COALESCE(d.name,'Cliente não encontrado') customer,d.payload->>'municipioNome' city,d.payload->>'ufSigla' uf,
  (SELECT max(collected_on)::text FROM web_inspection_records WHERE plan_id=p.id) last_date,
  (SELECT count(DISTINCT equipment_id)::int FROM m8_person_equipment WHERE person_id=p.customer_person_id AND present) equipment_count
  FROM web_inspection_plans p JOIN web_inspection_types t ON t.id=p.type_id LEFT JOIN LATERAL(SELECT name,payload FROM m8_customer_directory WHERE person_id=p.customer_person_id ORDER BY (company_id=p.customer_company_id) DESC,collected_at DESC LIMIT 1)d ON true ORDER BY d.name,t.name`)
  ).rows;
  return rows.map((r: any) => ({ ...r, forecast: inspectionForecast(r) }));
}
export async function inspectionsData(email: string, params: URLSearchParams) {
  const c = database();
  await inspectionAccess(c, email);
  const plans = await inspectionRows(c),
    person = params.get("customer"),
    report = params.get("report");
  let reportContext = null;
  if (report) {
    if (!uuid.test(report))
      throw new InspectionInputError("Relatório inválido.");
    const r = (
      await c.query(
        "SELECT id::text,customer_person_id::text,customer_company_id,document FROM web_vibration_reports WHERE id=$1",
        [report],
      )
    ).rows[0];
    if (!r) throw new InspectionInputError("Relatório não encontrado.");
    reportContext = { ...r, collectedOn: collectionDate(r.document) };
  }
  const id = params.get("plan");
  const records = id
    ? (
        await c.query(
          "SELECT r.id::text,r.collected_on::text,r.report_id::text,r.service_order,r.notes,r.created_by FROM web_inspection_records r WHERE plan_id=$1 ORDER BY collected_on DESC,created_at DESC",
          [uuid.test(id) ? id : null],
        )
      ).rows
    : [];
  const quotes = id
    ? (
        await c.query(
          "SELECT q.quote_id::text,w.number::text FROM web_inspection_quotes q JOIN web_quotes w ON w.id=q.quote_id WHERE q.plan_id=$1 ORDER BY q.created_at DESC",
          [uuid.test(id) ? id : null],
        )
      ).rows
    : [];
  return {
    plans: plans.filter((p: any) => !person || p.customer_person_id === person),
    types: (
      await c.query(
        "SELECT id::text,name,code FROM web_inspection_types ORDER BY name",
      )
    ).rows,
    records,
    quotes,
    report: reportContext,
  };
}
export async function recordReportInspection(
  c: any,
  planId: string,
  reportId: string,
  email: string,
) {
  const report = (
    await c.query("SELECT * FROM web_vibration_reports WHERE id=$1 FOR SHARE", [
      reportId,
    ])
  ).rows[0];
  const p = (
    await c.query(
      "SELECT p.*,t.code FROM web_inspection_plans p JOIN web_inspection_types t ON t.id=p.type_id WHERE p.id=$1 FOR UPDATE OF p",
      [planId],
    )
  ).rows[0];
  if (
    !p ||
    !report ||
    p.code !== "vibration" ||
    String(p.customer_person_id) !== String(report.customer_person_id)
  )
    throw new InspectionInputError(
      "Selecione o plano de vibração do mesmo cliente do relatório.",
    );
  const collected = collectionDate(report.document);
  await c.query(
    `INSERT INTO web_inspection_records(plan_id,collected_on,report_id,service_order,notes,created_by) VALUES($1,$2,$3,$4,'Coleta vinculada ao relatório de vibração',$5) ON CONFLICT(plan_id,report_id) DO UPDATE SET collected_on=EXCLUDED.collected_on,service_order=EXCLUDED.service_order`,
    [planId, collected, reportId, report.service_order || "", email],
  );
}
export async function saveInspection(b: any, email: string) {
  const c = await database().connect();
  try {
    await c.query("BEGIN READ WRITE");
    await inspectionAccess(c, email);
    if (b.reportId) {
      if (!uuid.test(b.reportId))
        throw new InspectionInputError("Relatório inválido.");
      await c.query(
        "SELECT id FROM web_vibration_reports WHERE id=$1 FOR UPDATE",
        [b.reportId],
      );
    }
    if (b.action === "quote") {
      if (!uuid.test(b.planId || "") || !uuid.test(b.requestId || ""))
        throw new InspectionInputError("Plano inválido.");
      await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        "inspection-quote:" + b.requestId,
      ]);
      const p = (await inspectionRows(c)).find(
        (row: any) => row.id === b.planId,
      );
      if (!p) throw new InspectionInputError("Plano não encontrado.");
      const old = (
        await c.query(
          "SELECT quote_id::text AS id FROM web_inspection_quotes WHERE request_id=$1 AND plan_id=$2",
          [b.requestId, b.planId],
        )
      ).rows[0];
      if (old) {
        await c.query("COMMIT");
        return { saved: true, quote: old };
      }
      const report = (
        await c.query(
          "SELECT report_id::text,collected_on::text FROM web_inspection_records WHERE plan_id=$1 ORDER BY collected_on DESC,created_at DESC LIMIT 1",
          [b.planId],
        )
      ).rows[0];
      const q = parseQuote({
        ...blankQuote(),
        company: String(p.customer_company_id),
        clientId: p.customer_person_id,
        client: p.customer,
        equipment: "Parque de máquinas do cliente",
        serviceType: p.type_name,
        interval:
          p.interval_value +
          " " +
          (p.interval_unit === "months" ? "meses" : "dias"),
        notes:
          "Plano de inspeção: " +
          p.type_name +
          "\nRota: " +
          p.route_name +
          "\nÚltima coleta: " +
          (p.forecast.lastDate || "Não registrada") +
          "\nPróxima inspeção: " +
          (p.forecast.due || "Não definida") +
          (report?.report_id
            ? "\nRelatório de vibração: " + report.report_id
            : "") +
          "\n" +
          p.notes,
      });
      const quote = (
        await c.query(
          "INSERT INTO web_quotes(id,company_id,client_name,equipment,service_type,document,total_cents,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,0,$7,$7) RETURNING id::text,number::text",
          [
            b.requestId,
            Number(q.company),
            q.client,
            q.equipment,
            q.serviceType,
            JSON.stringify(q),
            email,
          ],
        )
      ).rows[0];
      await c.query(
        "INSERT INTO web_inspection_quotes(request_id,plan_id,quote_id,created_by) VALUES($1,$2,$1,$3)",
        [b.requestId, b.planId, email],
      );
      await c.query("COMMIT");
      return { saved: true, quote };
    } else if (b.action === "type") {
      const name = text(b.name, 160, true);
      await c.query(
        "INSERT INTO web_inspection_types(name,created_by) VALUES($1,$2)",
        [name, email],
      );
    } else if (b.action === "save") {
      if (
        !uuid.test(b.id || "") ||
        !uuid.test(b.typeId || "") ||
        !/^\d{1,18}$/.test(b.customer || "") ||
        !Number.isInteger(b.interval) ||
        b.interval < 1 ||
        b.interval > 3650 ||
        !["days", "months"].includes(b.unit) ||
        !Number.isInteger(b.noticeDays) ||
        b.noticeDays < 0 ||
        b.noticeDays > 365
      )
        throw new InspectionInputError(
          "Confira cliente, tipo, periodicidade e antecedência.",
        );
      if (b.unit === "months" && b.interval > 120)
        throw new InspectionInputError(
          "A periodicidade máxima é de 120 meses.",
        );
      const last = date(b.lastDate),
        first = date(b.firstDue);
      if (
        !last &&
        !first &&
        !b.reportId &&
        !(
          b.version &&
          (
            await c.query(
              "SELECT 1 FROM web_inspection_records WHERE plan_id=$1 LIMIT 1",
              [b.id],
            )
          ).rows.length
        )
      )
        throw new InspectionInputError(
          "Informe a última inspeção ou a data da primeira inspeção.",
        );
      if (last && last > brazilToday())
        throw new InspectionInputError(
          "A última inspeção não pode ter data futura.",
        );
      if (
        !(
          await c.query(
            "SELECT 1 FROM m8_customer_directory WHERE person_id=$1 LIMIT 1",
            [b.customer],
          )
        ).rows.length
      )
        throw new InspectionInputError("Cliente não encontrado.");
      if (
        !(
          await c.query("SELECT 1 FROM web_inspection_types WHERE id=$1", [
            b.typeId,
          ])
        ).rows.length
      )
        throw new InspectionInputError("Tipo de inspeção não encontrado.");
      await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        "inspection:" + b.customer + ":" + b.typeId,
      ]);
      if (!b.version) {
        if (
          (
            await c.query(
              "SELECT id FROM web_inspection_plans WHERE customer_person_id=$1 AND type_id=$2",
              [b.customer, b.typeId],
            )
          ).rows.length
        )
          throw new InspectionInputError(
            "Já existe um plano deste tipo para o cliente. Abra o plano existente.",
          );
        await c.query(
          "INSERT INTO web_inspection_plans(id,customer_person_id,type_id,route_name,interval_value,interval_unit,notice_days,baseline_date,first_due,notes,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)",
          [
            b.id,
            b.customer,
            b.typeId,
            text(b.route || "", 160),
            b.interval,
            b.unit,
            b.noticeDays,
            b.reportId ? null : last,
            first,
            text(b.notes || "", 5000),
            email,
          ],
        );
      } else {
        if (!Number.isInteger(b.version) || typeof b.active !== "boolean")
          throw new InspectionInputError("Plano inválido.");
        const changed = await c.query(
          "UPDATE web_inspection_plans SET route_name=$2,interval_value=$3,interval_unit=$4,notice_days=$5,baseline_date=$6,first_due=$7,notes=$8,active=$9,version=version+1,updated_by=$10,updated_at=now() WHERE id=$1 AND version=$11 AND customer_person_id=$12 AND type_id=$13 RETURNING id",
          [
            b.id,
            text(b.route || "", 160),
            b.interval,
            b.unit,
            b.noticeDays,
            last,
            first,
            text(b.notes || "", 5000),
            b.active,
            email,
            b.version,
            b.customer,
            b.typeId,
          ],
        );
        if (!changed.rows.length)
          throw new InspectionConflict(
            "O plano foi alterado. Atualize antes de salvar.",
          );
      }
      if (b.reportId) {
        if (!uuid.test(b.reportId))
          throw new InspectionInputError("Relatório inválido.");
        await recordReportInspection(c, b.id, b.reportId, email);
      }
    } else if (b.action === "record") {
      if (!uuid.test(b.planId || "") || !uuid.test(b.id || ""))
        throw new InspectionInputError("Plano inválido.");
      const plan = (
        await c.query(
          "SELECT id FROM web_inspection_plans WHERE id=$1 FOR UPDATE",
          [b.planId],
        )
      ).rows[0];
      if (!plan) throw new InspectionInputError("Plano não encontrado.");
      if (b.reportId) {
        if (!uuid.test(b.reportId))
          throw new InspectionInputError("Relatório inválido.");
        await recordReportInspection(c, b.planId, b.reportId, email);
      } else {
        const at = date(b.collectedOn, true);
        if (at! > brazilToday())
          throw new InspectionInputError("A coleta não pode ter data futura.");
        await c.query(
          "INSERT INTO web_inspection_records(id,plan_id,collected_on,service_order,notes,created_by) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO NOTHING",
          [
            b.id,
            b.planId,
            at,
            text(b.serviceOrder || "", 100),
            text(b.notes || "", 5000),
            email,
          ],
        );
      }
    } else throw new InspectionInputError("Ação inválida.");
    const { syncTasks } = await import("../tasks/store");
    const { inspectionSources } = await import("./tasks");
    await syncTasks(() => inspectionSources(c), {
      client: c,
      inspectionOnly: true,
    });
    await c.query("COMMIT");
    return { saved: true };
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}

export async function refreshReportInspections(
  c: any,
  reportId: string,
  email: string,
) {
  if (
    !(
      await c.query(
        "SELECT to_regclass('public.web_inspection_records') AS relation",
      )
    ).rows[0]?.relation
  )
    return;
  const links = (
    await c.query(
      `SELECT p.id::text AS plan_id FROM web_inspection_plans p JOIN web_inspection_types t ON t.id=p.type_id WHERE t.code='vibration' AND ((p.customer_person_id=(SELECT customer_person_id FROM web_vibration_reports WHERE id=$1) AND p.active) OR EXISTS(SELECT 1 FROM web_inspection_records r WHERE r.plan_id=p.id AND r.report_id=$1)) ORDER BY p.id`,
      [reportId],
    )
  ).rows;
  for (const link of links)
    await recordReportInspection(c, link.plan_id, reportId, email);
  if (links.length) {
    const { syncTasks } = await import("../tasks/store");
    const { inspectionSources } = await import("./tasks");
    await syncTasks(() => inspectionSources(c), {
      client: c,
      inspectionOnly: true,
    });
  }
}
