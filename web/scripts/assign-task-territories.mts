import * as XLSX from "xlsx";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { randomUUID, createHash } from "node:crypto";
import { Client } from "pg";
const bytes = readFileSync(
  new URL("../../Divisão Vendedores Comercial.xlsx", import.meta.url),
);
const workbook = XLSX.read(bytes, { type: "buffer" });
const rows: any[][] = XLSX.utils.sheet_to_json(
  workbook.Sheets["Divisões administrativas"],
  { header: 1, defval: "" },
);
const fold = (s: unknown) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
const headers = rows[0].map(fold),
  city = headers.indexOf("CIDADE"),
  uf = headers.indexOf("ESTADO"),
  owner = headers.indexOf("ORCAMENTISTA");
if ([city, uf, owner].some((x) => x < 0)) throw Error("Cabeçalhos ausentes");
const map = new Map<string, Set<string>>();
for (const r of rows.slice(1)) {
  if (!r[city] || !r[uf]) continue;
  const key = fold(r[city]) + ":" + fold(r[uf]);
  map.set(
    key,
    new Set([
      ...(map.get(key) || []),
      fold(r[owner])
        .replace("HENRIQUEMEDEIROS", "HENRIQUE")
        .replace("MAICKCOELHO", "MAICK"),
    ]),
  );
}
const batch = randomUUID(),
  apply = process.argv.includes("--apply"),
  digest = createHash("sha256").update(bytes).digest("hex");
const dir = new URL("../../.m8/task-territories/", import.meta.url);
mkdirSync(dir, { recursive: true, mode: 0o700 });
const out = new URL(batch + ".json", dir),
  report: any = {
    batch,
    apply,
    digest,
    changes: [],
    pending: [],
    unchanged: [],
    notificationsCreated: 0,
  };
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
  await db.query("SELECT pg_advisory_xact_lock(81021,1)");
  const users = (
    await db.query(
      "SELECT email,display_name,enabled FROM web_user_access WHERE display_name IN ('Maick Coelho','Henrique Medeiros') FOR SHARE",
    )
  ).rows;
  const accounts = new Map<string, any>();
  for (const [short, name] of [
    ["MAICK", "Maick Coelho"],
    ["HENRIQUE", "Henrique Medeiros"],
  ]) {
    const matches = users.filter((u) => u.display_name === name && u.enabled);
    if (matches.length !== 1)
      throw Error("Cadastro de responsável ausente ou ambíguo");
    accounts.set(short, matches[0]);
  }
  const tasks = (
    await db.query(
      "SELECT * FROM web_tasks WHERE origin='Preventiva de Equipamento de Cliente' AND source_key LIKE 'preventive:%' AND status<>'completed' ORDER BY id FOR UPDATE",
    )
  ).rows;
  const links = (
    await db.query(
      `SELECT p.equipment_id::text equipment_id,p.person_id::text customer_id,p.company_id,p.person_name,d.payload->>'municipioNome' city,d.payload->>'ufSigla' uf FROM m8_person_equipment p LEFT JOIN m8_customer_directory d ON d.person_id=p.person_id AND d.company_id=p.company_id WHERE p.present AND p.equipment_id=ANY($1::bigint[])`,
      [tasks.map((t) => t.equipment_id)],
    )
  ).rows;
  for (const t of tasks) {
    const customers = links.filter(
      (l) => l.equipment_id === String(t.equipment_id),
    );
    const matches = customers.map((c) => ({
      ...c,
      owners: [...(map.get(fold(c.city) + ":" + fold(c.uf)) || [])],
    }));
    const owners = new Set(matches.flatMap((c) => c.owners));
    if (
      !matches.length ||
      matches.some((c) => c.owners.length !== 1) ||
      owners.size !== 1 ||
      !accounts.has([...owners][0])
    ) {
      report.pending.push({
        task_id: t.id,
        equipment_id: t.equipment_id,
        customer: t.customer,
        reason: !matches.length
          ? "sem cliente vinculado"
          : "cidade/UF ausente, não mapeada ou divisão ambígua",
        matches,
      });
      continue;
    }
    const user = accounts.get([...owners][0]);
    if (t.assigned_to === user.email) {
      report.unchanged.push(t.id);
      continue;
    }
    report.changes.push({
      task_id: t.id,
      equipment_id: t.equipment_id,
      version: t.version,
      before: {
        assigned_to: t.assigned_to,
        status: t.status,
        kanban_column: t.kanban_column,
        first_assigned_at: t.first_assigned_at,
        updated_by: t.updated_by,
      },
      after: { assigned_to: user.email, name: user.display_name },
      customers: matches,
    });
  }
  writeFileSync(
    out,
    JSON.stringify({ ...report, state: "prepared" }, null, 2),
    { mode: 0o600 },
  );
  if (apply && report.changes.length) {
    const sending = (await db.query("SELECT id FROM web_task_notifications WHERE task_id=ANY($1::bigint[]) AND state='pending' AND leased_until>now() FOR UPDATE",[report.changes.map((r:any)=>r.task_id)])).rows;
    if(sending.length)throw Error('Há avisos em processamento; aguarde antes da carga silenciosa.');
    const payload = JSON.stringify(report.changes);
    const updated = await db.query(
      `UPDATE web_tasks t SET assigned_to=x.email,status='in_progress',kanban_column=NULL,first_assigned_at=COALESCE(first_assigned_at,now()),updated_at=now(),updated_by='Sistema',version=t.version+1 FROM (SELECT (r->>'task_id')::bigint id,r->'after'->>'assigned_to' email,(r->>'version')::integer version FROM jsonb_array_elements($1::jsonb) r) x WHERE t.id=x.id AND t.version=x.version`,
      [payload],
    );
    if (updated.rowCount !== report.changes.length)
      throw Error("Conflito de versão");
    await db.query(
      `INSERT INTO web_task_notes(task_id,title,description,automatic,created_by,created_name) SELECT (r->>'task_id')::bigint,'Atribuição por divisão comercial','Atribuído a: '||(r->'after'->>'name')||'. Critério: cidade/UF do cliente e orçamentista da planilha Divisão Vendedores Comercial.xlsx. Carga sem aviso de WhatsApp. Lote: '||$2,true,'Sistema','Sistema' FROM jsonb_array_elements($1::jsonb) r`,
      [payload, batch],
    );
    // Suppress obsolete queued assignment alerts for the changed tasks. No new alerts are inserted.
    report.skippedNotifications = (
      await db.query(
        `UPDATE web_task_notifications SET state='skipped',lease_token=NULL,leased_until=NULL WHERE task_id=ANY($1::bigint[]) AND state='pending' RETURNING id`,
        [report.changes.map((r: any) => r.task_id)],
      )
    ).rows.map((r: any) => r.id);
  }
  await db.query(apply ? "COMMIT" : "ROLLBACK");
  report.state = apply ? "committed" : "dry-run";
  writeFileSync(out, JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log(
    JSON.stringify({
      batch,
      state: report.state,
      changes: report.changes.length,
      maick: report.changes.filter((r: any) => r.after.name === "Maick Coelho")
        .length,
      henrique: report.changes.filter(
        (r: any) => r.after.name === "Henrique Medeiros",
      ).length,
      pending: report.pending.length,
      alreadyAssigned: report.unchanged.length,
      notificationsCreated: 0,
      report: out.pathname,
    }),
  );
} catch (e) {
  await db.query("ROLLBACK").catch(() => {});
  throw e;
} finally {
  await db.end();
}
