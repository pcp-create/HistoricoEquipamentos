import { predictPlans } from "./preventive-hierarchy";
import { planItemUnit } from "./plan-items";
import { planClients } from "./plan-clients";
import { planCatalog } from "./plan-catalog";
import { rentalUsage } from "./rental-usage";
import { approvedMaterialSql } from "../material-approval";
import { rentalStatuses } from "./rental-status";
import "server-only";
import { randomUUID } from "node:crypto";
import { database } from "../db";
import {
  cascadeIntervention,
  preventiveMonths,
  emptyOperating,
  parseOperating,
  parsePlan,
  parseIntervention,
  predict,
  EquipmentInputError,
} from "./planning";
import { userDisplayName, type AuthUser } from "../user-display-name";
export class EquipmentConflict extends Error {}
const idOf = (v: unknown) => {
  if (typeof v !== "string" || !/^[1-9]\d{0,17}$/.test(v))
    throw new EquipmentInputError("Equipamento inválido.");
  return v;
};
const uuid = (v: unknown) =>
  typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const fold = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
// Equipment is the primary source; product copies fill missing internal IDs.
const internalCodeSql = `COALESCE(NULLIF(trim(e.payload->>'codigoIdentificacaoInterno'),''),
 (SELECT NULLIF(trim(p.payload->>'codigoIdentificacaoInterno'),'') FROM m8_product_catalog p
 WHERE p.product_id=e.equipment_id AND p.company_id IN(1,2,27404)
 AND NULLIF(trim(p.payload->>'codigoIdentificacaoInterno'),'') IS NOT NULL
 ORDER BY (p.company_id=1) DESC,p.collected_at DESC NULLS LAST,p.company_id LIMIT 1))`;
export async function equipmentList(params: URLSearchParams) {
  const q = fold((params.get("q") || "").trim().slice(0, 160));
  const ownership = params.get("ownership") || "";
  const rentalOnly = params.get("rental") === "1";
  const state = params.get("state") || "";
  const requested = Number(params.get("page") || 1);
  if (!Number.isSafeInteger(requested) || requested < 1)
    throw new EquipmentInputError("Página inválida.");
  const db = database();
  const rows = (
    await db.query(`SELECT e.equipment_id::text AS id,e.name,e.brand,COALESCE(NULLIF(e.model,''),array_to_string(e.models,' / ')) AS model,e.serial,e.blocked,
 COALESCE(e.payload->>'familiaId'='3',false) AS rental,
 ${internalCodeSql} AS internal_code,
 COALESCE(s.document,'{}') AS settings,
 COALESCE(c.clients,'[]') AS clients
 FROM m8_equipment_catalog e LEFT JOIN web_equipment_settings s USING(equipment_id)
 LEFT JOIN LATERAL (SELECT jsonb_agg(jsonb_build_object('id',p.person_id::text,'name',p.name) ORDER BY p.name) AS clients FROM (
 SELECT person_id,max(person_name) AS name FROM m8_person_equipment WHERE equipment_id=e.equipment_id AND present GROUP BY person_id) p) c ON true
 WHERE e.present ORDER BY e.name,e.equipment_id`)
  ).rows;
  const plans = (
    await db.query(
      "SELECT id,equipment_id::text,document FROM web_equipment_plans WHERE NOT archived",
    )
  ).rows;
  const byEquipment = new Map<string, any[]>();
  for (const p of plans)
    byEquipment.set(p.equipment_id, [
      ...(byEquipment.get(p.equipment_id) || []),
      { ...p.document, id: p.id },
    ]);
  const priority: Record<string, number> = {
    overdue: 0,
    due: 1,
    soon: 2,
    incomplete: 3,
    scheduled: 4,
    none: 5,
  };
  const usage = await rentalUsage(
    rows.filter((e) => e.rental).map((e) => e.id),
  );
  const rentalStates = await rentalStatuses(
    rows.filter((e) => e.rental).map((e) => e.id),
  );
  const all = rows
    .map((e) => {
      const planned = predictPlans(byEquipment.get(e.id) || [], { ...emptyOperating, ...e.settings }, undefined, usage.get(e.id));
      const forecasts = planned.filter(p => !p.coveredBy).map(p => p.forecast);
      const urgent = [...forecasts].sort(
        (a, b) =>
          priority[a.status] - priority[b.status] ||
          (a.due || "9999").localeCompare(b.due || "9999"),
      )[0];
      return {
        ...e,
        ownership: e.rental ? "own" : e.settings.ownership || "unknown",
        rentalStatus: rentalStates.get(e.id) || null,
        plans: planned.length,
        forecast: urgent || null,
      };
    })
    .filter(
      (e) =>
        (!q ||
          fold(
            [
              e.id,
              e.rental ? e.internal_code : "",
              e.name,
              e.model,
              e.serial,
              e.brand,
              e.rentalStatus?.customer,
              e.rentalStatus?.label,
              e.rentalStatus?.contract?.label,
              e.rentalStatus?.stockNote,
              ...e.clients.map((c: any) => c.name || c.id),
            ].join(" "),
          ).includes(q)) &&
        (!ownership || e.ownership === ownership) &&
        (!rentalOnly || e.rental),
    );
  const counts = {
    equipment: all.length,
    overdue: all.filter((e) => ["overdue", "due"].includes(e.forecast?.status))
      .length,
    soon: all.filter((e) => e.forecast?.status === "soon").length,
    unplanned: all.filter((e) => !e.plans).length,
  };
  const filtered = all.filter(
    (e) =>
      !state || (state === "none" ? !e.plans : e.forecast?.status === state),
  );
  const page = Math.min(
    requested,
    Math.max(1, Math.ceil(filtered.length / 30)),
  );
  const selected =
    params.get("all") === "1"
      ? filtered
      : filtered.slice((page - 1) * 30, page * 30);
  if (selected.length) {
    const latest = (
      await db.query(
        `WITH links AS (
 SELECT equipment_id,company_id,order_id FROM m8_equipment_linked WHERE equipment_id=ANY($1::bigint[])
 UNION
 SELECT produto_id,company_id,ordem_servico_id FROM m8_os_produtos WHERE produto_id=ANY($1::bigint[])
 )
 SELECT DISTINCT ON(l.equipment_id) l.equipment_id::text,o.id_m8::text AS order_id,o.company_id,COALESCE(o.emissao,o.data_abertura) AS date,o.cliente_nome,o.tipo_nome,o.status
 FROM links l JOIN m8_ordens_servico o ON o.company_id=l.company_id AND o.id_m8=l.order_id
 WHERE o.company_id IN(1,2,27404) AND lower(trim(COALESCE(o.status,''))) NOT IN ('cancelado','cancelada')
 AND (NOT EXISTS (SELECT 1 FROM m8_os_produtos p WHERE p.company_id=l.company_id AND p.ordem_servico_id=l.order_id AND p.produto_id=l.equipment_id)
 OR EXISTS (SELECT 1 FROM m8_os_produtos p WHERE p.company_id=l.company_id AND p.ordem_servico_id=l.order_id AND p.produto_id=l.equipment_id AND p.esta_excluido IS NOT TRUE AND ${approvedMaterialSql("p")}))
 ORDER BY l.equipment_id,COALESCE(o.emissao,o.data_abertura) DESC NULLS LAST,o.id_m8 DESC,o.company_id DESC`,
        [selected.map((e) => e.id)],
      )
    ).rows;
    for (const e of selected)
      e.latest = latest.find((r) => r.equipment_id === e.id) || null;
  }
  return {
    rows: selected,
    total: filtered.length,
    page,
    pages: Math.max(1, Math.ceil(filtered.length / 30)),
    counts,
  };
}
export async function equipmentDetail(raw: string) {
  const id = idOf(raw),
    db = database();
  const equipment = (
    await db.query(
      `SELECT equipment_id::text AS id,name,brand,COALESCE(NULLIF(model,''),array_to_string(models,' / ')) AS model,serial,blocked,collected_at,present,COALESCE(payload->>'familiaId'='3',false) AS rental,${internalCodeSql} AS internal_code FROM m8_equipment_catalog e WHERE equipment_id=$1`,
      [id],
    )
  ).rows[0];
  if (!equipment) throw new EquipmentInputError("Equipamento não encontrado.");
  equipment.rentalStatus = equipment.rental
    ? (await rentalStatuses([id])).get(id)
    : null;
  equipment.usage = equipment.rental
    ? (await rentalUsage([id])).get(id)
    : undefined;
  const clients = (
    await db.query(
      "SELECT person_id::text AS id,max(person_name) AS name FROM m8_person_equipment WHERE equipment_id=$1 AND present GROUP BY person_id ORDER BY name",
      [id],
    )
  ).rows;
  const settings = (
    await db.query(
      "SELECT document,version,updated_at,updated_by FROM web_equipment_settings WHERE equipment_id=$1",
      [id],
    )
  ).rows[0] || { document: emptyOperating, version: null };
  const plans = (
    await db.query(
      "SELECT id,document,version,updated_at,updated_by FROM web_equipment_plans WHERE equipment_id=$1 AND NOT archived ORDER BY updated_at DESC",
      [id],
    )
  ).rows.map((p) => ({
    ...p,
    forecast: predict(
      p.document,
      settings.document,
      undefined,
      equipment.usage,
    ),
  }));
  const grouped = predictPlans(plans.map(p => ({ ...p.document, id: p.id })), settings.document, undefined, equipment.usage);
  for (const p of plans) Object.assign(p.forecast, { coveredBy: grouped.find(g => g.id === p.id)?.coveredBy || null });
  const history = (
    await db.query(
      `SELECT o.id_m8::text AS id,o.company_id,COALESCE(o.emissao,o.data_abertura) AS date,o.cliente_nome,o.tipo_nome,o.status,o.total_geral::text AS total,l.method
 FROM m8_equipment_linked l JOIN m8_ordens_servico o ON o.company_id=l.company_id AND o.id_m8=l.order_id
 WHERE l.equipment_id=$1 ORDER BY COALESCE(o.emissao,o.data_abertura) DESC NULLS LAST,o.id_m8 DESC LIMIT 30`,
      [id],
    )
  ).rows;
  const events = (
    await db.query(
      `SELECT e.id::text,e.plan_id,e.kind,e.document,e.created_at,e.created_by,e.display_name, (SELECT q.document->>'deletedAt' FROM web_quotes q WHERE q.id::text=e.document->>'quoteId') AS quote_deleted_at FROM web_equipment_events e WHERE e.equipment_id=$1 ORDER BY e.created_at DESC,e.id DESC LIMIT 50`,
      [id],
    )
  ).rows;
  if (equipment.rental)
    settings.document = { ...settings.document, ownership: "own" };
  return {
    equipment,
    clients,
    quoteClients: await planClients(db, id),
    settings,
    plans,
    history,
    events,
  };
}
export async function saveEquipment(input: any, user: AuthUser) {
  const equipment = idOf(input?.equipment);
  if (!["settings", "plan", "maintenance", "archive"].includes(input?.action))
    throw new EquipmentInputError("Ação inválida.");
  if (
    input.version !== null &&
    (!Number.isSafeInteger(input.version) || input.version < 1)
  )
    throw new EquipmentInputError("Versão inválida.");
  const c = await database().connect();
  try {
    await c.query("BEGIN READ WRITE");
    const exists = (
      await c.query(
        "SELECT equipment_id,COALESCE(payload->>'familiaId'='3',false) AS rental FROM m8_equipment_catalog WHERE equipment_id=$1 FOR UPDATE",
        [equipment],
      )
    ).rows[0];
    if (!exists) throw new EquipmentInputError("Equipamento não encontrado.");
    let intervention: ReturnType<typeof parseIntervention> | null = null;
    let before: any = null,
      after: any = null,
      planId: string | null = null;
    if (input.action === "settings") {
      after = parseOperating(input.document);
      if (exists.rental) after.ownership = "own";
      before =
        (
          await c.query(
            "SELECT document,version FROM web_equipment_settings WHERE equipment_id=$1",
            [equipment],
          )
        ).rows[0] || null;
      if ((before?.version ?? null) !== input.version)
        throw new EquipmentConflict(
          "Configuração alterada por outra pessoa. Reabra o equipamento.",
        );
      const baselines = (
        await c.query(
          "SELECT document FROM web_equipment_plans WHERE equipment_id=$1 AND NOT archived",
          [equipment],
        )
      ).rows;
      if (
        after.meter != null &&
        baselines.some(
          (r) =>
            r.document.lastDate <= after.meterDate &&
            r.document.lastMeter != null &&
            r.document.lastMeter > after.meter,
        )
      )
        throw new EquipmentInputError(
          "Leitura menor que o horímetro de uma intervenção. Confira os valores.",
        );
      await c.query(
        `INSERT INTO web_equipment_settings(equipment_id,document,updated_by) VALUES($1,$2,$3)
 ON CONFLICT(equipment_id) DO UPDATE SET document=$2,updated_by=$3,updated_at=now(),version=web_equipment_settings.version+1`,
        [equipment, JSON.stringify(after), user.email],
      );
    } else {
      if (input.id != null && !uuid(input.id))
        throw new EquipmentInputError("Plano inválido.");
      if (input.id)
        before = (
          await c.query(
            "SELECT * FROM web_equipment_plans WHERE id=$1 AND equipment_id=$2 AND NOT archived",
            [input.id, equipment],
          )
        ).rows[0];
      if (input.id && !before)
        throw new EquipmentInputError(
          "Plano não encontrado neste equipamento.",
        );
      if ((before?.version ?? null) !== input.version)
        throw new EquipmentConflict(
          "Plano alterado por outra pessoa. Reabra o equipamento.",
        );
      if (input.action !== "plan" && !before)
        throw new EquipmentInputError("Selecione um plano existente.");
      planId = before?.id || randomUUID();
      if (input.action === "plan") {
        after = parsePlan(input.document);
        const catalog = await planCatalog(c, after.items || []);
        after.items = (after.items || []).map((i: any) => ({
          ...i,
          name: catalog.get(`${i.kind}:${i.code}`)!.name,
          ...planItemUnit(i, catalog.get(`${i.kind}:${i.code}`)!.unit),
        }));
        after.months ??= preventiveMonths(after.hours);
      }
      if (input.action === "maintenance") {
        const event = parseIntervention(input.document);
        if (before.document.lastDate && event.date < before.document.lastDate)
          throw new EquipmentInputError(
            "A intervenção não pode ser anterior à última registrada no plano.",
          );
        if (before.document.hours && event.meter == null)
          throw new EquipmentInputError(
            "Informe o horímetro para o plano por horas.",
          );
        if (
          event.meter != null &&
          before.document.lastMeter != null &&
          event.meter < before.document.lastMeter
        )
          throw new EquipmentInputError("O horímetro não pode diminuir.");
        after = {
          ...before.document,
          lastDate: event.date,
          lastMeter: event.meter,
          lastOrder: event.order,
        };
        intervention = event;
      }
      if (input.action === "archive") after = before.document;
      if (after.lastOrder && input.action !== "archive") {
        const linked = (
          await c.query(
            `SELECT 1 FROM m8_equipment_linked WHERE equipment_id=$1 AND order_id=$2 LIMIT 1`,
            [equipment, after.lastOrder],
          )
        ).rowCount;
        if (!linked)
          throw new EquipmentInputError(
            "A OS informada não está vinculada a este equipamento. Deixe em branco se não houver OS na base.",
          );
      }
      const setting = (
        await c.query(
          "SELECT document FROM web_equipment_settings WHERE equipment_id=$1",
          [equipment],
        )
      ).rows[0]?.document;
      if (
        setting?.meter != null &&
        after.lastMeter != null &&
        setting.meterDate >= after.lastDate &&
        setting.meter < after.lastMeter
      )
        throw new EquipmentInputError(
          "A leitura do equipamento é menor que o horímetro desta intervenção. Atualize a leitura antes de salvar.",
        );
      if (before)
        await c.query(
          "UPDATE web_equipment_plans SET document=$3,archived=$4,version=version+1,updated_at=now(),updated_by=$5 WHERE id=$1 AND equipment_id=$2",
          [
            planId,
            equipment,
            JSON.stringify(after),
            input.action === "archive",
            user.email,
          ],
        );
      else
        await c.query(
          "INSERT INTO web_equipment_plans(id,equipment_id,document,updated_by) VALUES($1,$2,$3,$4)",
          [planId, equipment, JSON.stringify(after), user.email],
        );
    }
    if (input.action === "maintenance") {
      const smaller = (
        await c.query(
          "SELECT id,document FROM web_equipment_plans WHERE equipment_id=$1 AND NOT archived AND id<>$2 FOR UPDATE",
          [equipment, planId],
        )
      ).rows;
      for (const row of smaller) {
        const cascaded = cascadeIntervention(row.document, after);
        if (!cascaded) continue;
        await c.query(
          "UPDATE web_equipment_plans SET document=$2,version=version+1,updated_at=now(),updated_by=$3 WHERE id=$1",
          [row.id, JSON.stringify(cascaded), user.email],
        );
        await c.query(
          "INSERT INTO web_equipment_events(equipment_id,plan_id,kind,document,created_by,display_name) VALUES($1,$2,'maintenance',$3,$4,$5)",
          [
            equipment,
            row.id,
            JSON.stringify({
              before: row.document,
              after: cascaded,
              intervention,
              sourcePlan: planId,
              cascade: true,
            }),
            user.email,
            userDisplayName(user),
          ],
        );
      }
    }
    await c.query(
      "INSERT INTO web_equipment_events(equipment_id,plan_id,kind,document,created_by,display_name) VALUES($1,$2,$3,$4,$5,$6)",
      [
        equipment,
        planId,
        input.action,
        JSON.stringify({
          before: before?.document || null,
          after,
          intervention,
        }),
        user.email,
        userDisplayName(user),
      ],
    );
    await c.query("COMMIT");
    return { saved: true };
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
