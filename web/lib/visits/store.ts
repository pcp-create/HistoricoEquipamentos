import { canManageVisits } from "../access-roles";
import {saveVisitRecords} from "./records";
import "server-only";
import {storeContact} from "./contacts";
import {syncVisitTask} from "./automatic-task";
import { database } from "../db";
import { AdminInputError } from "../admin-store";
import { Forbidden } from "../auth";
import { cityKey } from "../tasks/territories";
import { customerTradeName, visitHealth, type VisitCustomer } from "./model";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function visitIdentity(db: any, email: string) {
  const u = (
    await db.query(
      "SELECT enabled,role,job_title,display_name FROM web_user_access WHERE email=$1",
      [email],
    )
  ).rows[0];
  if (!u?.enabled) throw new Forbidden();
  return u;
}
export async function visitsData(email: string, db: any = database(), management = false) {
  email = email.toLowerCase();
  const user = await visitIdentity(db, email);
  if (management && !canManageVisits(user.role)) throw new Forbidden();
  const historical = (await db.query("SELECT DISTINCT customer_key FROM web_sales_visits WHERE $2::boolean OR seller=$1",[email,management])).rows.map((r:any)=>r.customer_key);
  const rules = (
    await db.query(
      "SELECT city_key,uf,seller_user FROM web_task_territories WHERE ($2::boolean OR seller_user=$1)",
      [email,management],
    )
  ).rows;
  const directAssignments=(await db.query("SELECT person_id::text,seller_user FROM web_customer_registry WHERE company_id=1 AND seller_user IS NOT NULL")).rows;
  const directSellers=new Map<string,string>(directAssignments.map((row:any)=>[row.person_id,row.seller_user]));
  const assignedKeys=directAssignments.filter((row:any)=>management||row.seller_user===email).map((row:any)=>`m8:${row.person_id}`);
  const territories = new Set(rules.map((r: any) => r.city_key + ":" + r.uf));
  const source = (
    await db.query(
      `SELECT DISTINCT ON (d.person_id) d.company_id,d.person_id::text,d.name,d.document,d.payload,
         EXISTS(SELECT 1 FROM m8_person_equipment e WHERE e.person_id=d.person_id AND e.present) AS has_equipment
       FROM m8_customer_directory d
       WHERE EXISTS (SELECT 1 FROM m8_person_equipment e WHERE e.person_id=d.person_id AND e.present) OR ('m8:' || d.person_id::text)=ANY($1::text[])
       ORDER BY d.person_id,d.collected_at DESC,d.company_id`,
      [[...historical,...assignedKeys]],
    )
  ).rows;
  const mine = source.filter((r:any)=>management || historical.includes(`m8:${r.person_id}`) ||
    (directSellers.has(r.person_id)?directSellers.get(r.person_id)===email:territories.has(cityKey(r.payload?.municipioNome||'')+':'+String(r.payload?.ufSigla||'').toUpperCase())));
  const leads = (
    await db.query(
      "SELECT * FROM web_sales_leads WHERE ($2::boolean OR owner=$1) ORDER BY name",
      [email,management],
    )
  ).rows;
  const keys = [
    ...mine.map((r: any) => `m8:${r.person_id}`),
    ...leads.map((r: any) => `lead:${r.id}`),
  ];
  const locations = (await db.query("SELECT customer_key,latitude,longitude,version FROM web_sales_customer_locations WHERE customer_key=ANY($1::text[])",[keys])).rows;
  const locationMap = new Map<string, any>(locations.map((r: any) => [r.customer_key,r]));
  const last = (
    await db.query(
      "SELECT v.customer_key,max(v.completed_at) last FROM web_sales_visits v JOIN web_user_access u ON u.email=v.seller WHERE v.customer_key=ANY($1::text[]) AND v.status='completed' AND lower(trim(u.job_title)) IN ('vendedor','vendedora') AND ($3::boolean OR v.seller=$2) GROUP BY v.customer_key",
      [keys, email, management],
    )
  ).rows;
  const lastMap = new Map(
    last.map((r: any) => [r.customer_key, new Date(r.last).toISOString()]),
  );
  const points = (
    await db.query(
      "SELECT DISTINCT ON (person_id) person_id::text,latitude,longitude FROM web_customer_map_points WHERE person_id=ANY($1::bigint[]) ORDER BY person_id,updated_at DESC",
      [mine.map((r: any) => r.person_id)],
    )
  ).rows;
  const pointMap = new Map<string, any>(
    points.map((r: any) => [r.person_id, r]),
  );
  const equipmentRows = (await db.query(`
    SELECT DISTINCT p.person_id::text,p.equipment_id::text AS id,
      COALESCE(e.name,'Equipamento') AS name,COALESCE(e.model,'') AS model,
      COALESCE(e.serial,'') AS serial,s.document AS settings,s.version
    FROM m8_person_equipment p
    LEFT JOIN m8_equipment_catalog e ON e.equipment_id=p.equipment_id
    LEFT JOIN web_equipment_settings s ON s.equipment_id=p.equipment_id
    WHERE p.present AND p.person_id=ANY($1::bigint[])
    ORDER BY p.person_id::text,p.equipment_id::text`,
    [mine.map((r: any) => r.person_id)])).rows;
  const equipmentMap = new Map<string, NonNullable<VisitCustomer["equipment"]>>();
  for (const row of equipmentRows) {
    const items = equipmentMap.get(row.person_id) || [];
    items.push({id: row.id, name: row.name, model: row.model, serial: row.serial, meter: row.settings?.meter ?? null, meterDate: row.settings?.meterDate || "", version: row.version ?? null});
    equipmentMap.set(row.person_id, items);
  }
  const customers: VisitCustomer[] = [
    ...mine.map((r: any) => {
      const p = pointMap.get(r.person_id);
      return {
        key: `m8:${r.person_id}`,
        name: r.name || "Cliente sem nome",
        tradeName: customerTradeName(r.payload),
        document: r.document || "",
        city: r.payload.municipioNome || "",
        uf: r.payload.ufSigla || "",
        address: [r.payload.logradouro, r.payload.numero, r.payload.bairro]
          .filter(Boolean)
          .join(", "),
        seller_ids: directSellers.has(r.person_id) ? [directSellers.get(r.person_id)!] : rules.filter((rule:any)=>rule.city_key === cityKey(r.payload?.municipioNome || "") && rule.uf === String(r.payload?.ufSigla || "").toUpperCase()).map((rule:any)=>rule.seller_user).filter(Boolean),
        in_portfolio: directSellers.has(r.person_id) ? (management || directSellers.get(r.person_id)===email) : r.has_equipment && (management || territories.has(cityKey(r.payload?.municipioNome || "") + ":" + String(r.payload?.ufSigla || "").toUpperCase())),
        lead: false,
        equipment: equipmentMap.get(r.person_id) || [],
        latitude: p?.latitude ?? null,
        longitude: p?.longitude ?? null,
      };
    }),
    ...leads.map((r: any) => ({
      key: `lead:${r.id}`,
      name: `Lead · ${r.name}`,
      document: "",
      city: r.city,
      uf: r.uf,
      address: r.address,
      seller_ids: [r.owner],
      in_portfolio: false,
      lead: true,
      equipment: [],
      latitude: null,
      longitude: null,
    })),
  ].map((c) => {
    const lastVisit = (lastMap.get(c.key) as string) || null;
    const location = locationMap.get(c.key);
    return { ...c, latitude: location?.latitude ?? c.latitude, longitude: location?.longitude ?? c.longitude,
      locationVersion: location?.version ?? 0, lastVisit, health: visitHealth(lastVisit) };
  });
  const disqualifications = (await db.query("SELECT * FROM web_sales_disqualifications WHERE customer_key=ANY($1::text[])",[keys])).rows;
  for (const customer of customers) customer.disqualification = disqualifications.find((row:any)=>row.customer_key===customer.key);
  customers.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const visits = (
    await db.query(
      "SELECT v.*,(SELECT vt.task_id::text FROM web_sales_visit_tasks vt WHERE vt.request_id=v.id AND vt.visit_id=v.id) AS task_id,p.name AS purpose_name FROM web_sales_visits v LEFT JOIN web_sales_visit_purposes p ON p.id=v.purpose_id WHERE $3::boolean OR (seller=$1 AND customer_key=ANY($2::text[])) ORDER BY scheduled_at DESC",
      [email, keys, management],
    )
  ).rows;
  const sellers = (await db.query(`
    SELECT u.email AS id,u.enabled,COALESCE(NULLIF(u.display_name,''),u.email) AS name,
      p.latitude,p.longitude,p.located_at,u.last_seen_at,
      (u.last_seen_at>now()-interval '15 minutes' AND
       (u.last_logout_at IS NULL OR u.last_seen_at>u.last_logout_at)) IS TRUE AS online
    FROM web_user_access u LEFT JOIN web_field_locations p ON p.actor=u.email
    WHERE ((u.enabled AND lower(trim(u.job_title)) IN ('vendedor','vendedora')) OR ($3::boolean AND (EXISTS(SELECT 1 FROM web_sales_visits v WHERE v.seller=u.email) OR EXISTS(SELECT 1 FROM web_task_territories t WHERE t.seller_user=u.email) OR EXISTS(SELECT 1 FROM web_sales_leads l WHERE l.owner=u.email))))
      AND ($2::boolean OR u.email=$1)
    ORDER BY u.display_name,u.email`, [email,management || user.role === "admin",management])).rows;
  const purposes = (await db.query("SELECT id::text,name,description,active,version FROM web_sales_visit_purposes WHERE active ORDER BY id")).rows;
  const assignees = management ? (await db.query("SELECT email AS id,COALESCE(NULLIF(display_name,''),email) AS name FROM web_user_access WHERE enabled ORDER BY display_name,email")).rows : undefined;
  return { assignees, canEditVisits:canManageVisits(user.role), purposes, name: user.display_name || email, customers, visits, sellers, canManage: canManageVisits(user.role) };
}
function text(b: any, key: string, max: number, required = false) {
  const value = b?.[key];
  if (
    typeof value !== "string" ||
    value.trim().length > max ||
    (required && !value.trim())
  )
    throw new AdminInputError(
      `Preencha ${({ customer_key: "o cliente", name: "o nome", city: "a cidade", uf: "a UF", address: "o endereço", contact: "o contato", phone: "o telefone", description: "a descrição", outcome: "o registro da visita" } as Record<string, string>)[key] || "os dados"} corretamente.`,
    );
  return value.trim();
}
function instant(value: unknown) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) ||
    !Number.isFinite(Date.parse(value))
  )
    throw new AdminInputError("Informe data e horário válidos.");
  return new Date(value);
}
export async function saveVisit(b: any, email: string) {
  email = email.toLowerCase();
  if (!uuid.test(b?.id || ""))
    throw new AdminInputError("Identificador inválido.");
  if (!["schedule", "complete", "cancel", "history"].includes(b.action))
    throw new AdminInputError("Ação inválida.");
  const c = await database().connect();
  try {
    await c.query("BEGIN READ WRITE");
    const actor = await visitIdentity(c, email);
    await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      "visits:" + email,
    ]);
    const assigning = ["schedule", "history"].includes(b.action) && b.seller != null;
    const seller = assigning ? text(b, "seller", 254, true).toLowerCase() : email;
    if (assigning && seller !== email && !canManageVisits(actor.role)) throw new Forbidden();
    if (assigning && seller !== email) await visitIdentity(c, seller);
    const data = await visitsData(seller, c);
    let created=false;
    if (["schedule", "history"].includes(b.action)) {
      let key = text(b, "customer_key", 120);
      if (b.lead) {
        if (!uuid.test(b.lead.id || ""))
          throw new AdminInputError("Lead inválido.");
        const name = text(b.lead, "name", 180, true),
          city = text(b.lead, "city", 150, true),
          uf = text(b.lead, "uf", 2, true).toUpperCase(),
          address = text(b.lead, "address", 300);
        if (
          !"AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO"
            .split(" ")
            .includes(uf)
        )
          throw new AdminInputError("UF inválida.");
        await c.query(
          "INSERT INTO web_sales_leads(id,owner,name,city,uf,address) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO NOTHING",
          [b.lead.id, seller, name, city, uf, address],
        );
        const lead = (
          await c.query("SELECT owner FROM web_sales_leads WHERE id=$1", [
            b.lead.id,
          ])
        ).rows[0];
        if (lead?.owner !== seller) throw new Forbidden();
        key = "lead:" + b.lead.id;
        if (b.lead.location != null) {
          const {latitude,longitude}=b.lead.location;
          if(typeof latitude!=="number" || !Number.isFinite(latitude) || Math.abs(latitude)>85 || typeof longitude!=="number" || !Number.isFinite(longitude) || Math.abs(longitude)>180)
            throw new AdminInputError("Informe uma localização válida para o Lead.");
          await c.query(`INSERT INTO web_sales_customer_locations(customer_key,latitude,longitude,updated_by) VALUES($1,$2,$3,$4)
            ON CONFLICT(customer_key) DO NOTHING`,[key,latitude,longitude,email]);
        }

      } else if (!data.customers.some((x) => x.key === key)) {
        if (!/^m8:\d+$/.test(key) || !(await c.query("SELECT 1 FROM m8_customer_directory WHERE person_id=$1 LIMIT 1",[key.slice(3)])).rows.length) throw new Forbidden();
      }
      const purpose = b.purpose_id;
      if (!/^\d+$/.test(String(purpose || "")) || !(await c.query("SELECT 1 FROM web_sales_visit_purposes WHERE id=$1 AND active FOR SHARE",[purpose])).rows.length)
        throw new AdminInputError("Selecione uma finalidade da visita ativa.");
      let selectedContact:any=null;
      if(b.contact_id){if(!uuid.test(b.contact_id))throw new AdminInputError('Contato inválido.');selectedContact=(await c.query('SELECT id,name,phone FROM web_customer_contacts WHERE id=$1 AND customer_key=$2',[b.contact_id,key])).rows[0];if(!selectedContact)throw new AdminInputError('Selecione um contato deste cliente.');}
      else if(b.contact||b.phone)selectedContact=await storeContact(c,key,{name:b.contact,phone:b.phone},email);
      const at = instant(b.scheduled_at),
        contact = selectedContact?.name || text(b, "contact", 160, true),
        phone = selectedContact?.phone || text(b, "phone", 40, true),
        description = text(b, "description", 10000);
      if (!/^[+()\d\s.-]{8,40}$/.test(phone))
        throw new AdminInputError("Informe um telefone válido.");
      const completed = b.action === "history";
      const outcome = completed ? text(b, "outcome", 10000, true) : "";
      if (completed && at.getTime() > Date.now())
        throw new AdminInputError(
          "Uma visita realizada não pode ter data futura.",
        );
      const inserted=await c.query(
        `INSERT INTO web_sales_visits(id,seller,customer_key,scheduled_at,contact,phone,description,status,completed_at,outcome,purpose_id,contact_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT(id) DO NOTHING RETURNING id`,
        [
          b.id,
          seller,
          key,
          at,
          contact,
          phone,
          description,
          completed ? "completed" : "scheduled",
          completed ? at : null,
          outcome,
          purpose,
          selectedContact?.id||null,
        ],
      );
      created=inserted.rows.length>0;
      const owner = (
        await c.query("SELECT seller FROM web_sales_visits WHERE id=$1", [b.id])
      ).rows[0];
      if (owner?.seller !== seller) throw new Forbidden();
    } else {
      const old = data.visits.find((v: any) => v.id === b.id);
      if (!old) throw new Forbidden();
      if (old.status !== "scheduled" || old.version !== b.version)
        throw new AdminInputError("Visita alterada. Atualize a lista.");
      const at = b.action === "complete" ? instant(b.completed_at) : null;
      const outcome =
        b.action === "complete" ? text(b, "outcome", 10000, true) : "";
      if (at && at.getTime() > Date.now())
        throw new AdminInputError("A realização não pode ter data futura.");
      await c.query(
        "UPDATE web_sales_visits SET status=$2,completed_at=$3,outcome=$4,version=version+1,updated_at=now() WHERE id=$1",
        [
          b.id,
          b.action === "complete" ? "completed" : "cancelled",
          at,
          outcome,
        ],
      );
    }
    if(['history','complete'].includes(b.action))await saveVisitRecords(c,b,email,data.customers);
    if(b.action==='cancel')await c.query("UPDATE web_sales_visit_alerts SET state='cancelled' WHERE visit_id=$1 AND state='pending'",[b.id]);
    await syncVisitTask(c,b.id,email,created,created?b.whatsappAt:undefined);
    await c.query(
      "INSERT INTO web_access_events(event,email,actor,details) VALUES('sales_visit',$1,$1,$2)",
      [email, JSON.stringify({ action: b.action, id: b.id, seller })],
    );
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}

export async function saveCustomerLocation(body: any, email: string) {
  if (typeof body.latitude !== "number" || !Number.isFinite(body.latitude) || Math.abs(body.latitude)>85 ||
      typeof body.longitude !== "number" || !Number.isFinite(body.longitude) || Math.abs(body.longitude)>180 ||
      !Number.isSafeInteger(body.version) || body.version < 0) throw new AdminInputError("Informe uma localização válida.");
  email = email.toLowerCase();
  const c = await database().connect();
  try {
    await c.query("BEGIN READ WRITE");
    const data = await visitsData(email,c);
    if (!data.customers.some(customer => customer.key === body.customer_key) && (!/^m8:\d+$/.test(body.customer_key || "") || !(await c.query("SELECT 1 FROM m8_customer_directory WHERE person_id=$1 LIMIT 1",[body.customer_key.slice(3)])).rows.length)) throw new Forbidden();
    const result = body.version === 0
      ? await c.query(`INSERT INTO web_sales_customer_locations(customer_key,latitude,longitude,updated_by)
        VALUES($1,$2,$3,$4) ON CONFLICT(customer_key) DO NOTHING RETURNING version`,[body.customer_key,body.latitude,body.longitude,email])
      : await c.query(`UPDATE web_sales_customer_locations SET latitude=$2,longitude=$3,updated_by=$4,updated_at=now(),version=version+1
        WHERE customer_key=$1 AND version=$5 RETURNING version`,[body.customer_key,body.latitude,body.longitude,email,body.version]);
    if (!result.rows.length) throw new AdminInputError("A localização foi alterada por outra pessoa. Atualize a tela antes de tentar novamente.");
    await c.query("INSERT INTO web_access_events(event,email,actor,details) VALUES('sales_customer_location',$1,$1,$2)",
      [email,JSON.stringify({customer_key:body.customer_key,latitude:body.latitude,longitude:body.longitude})]);
    await c.query("COMMIT");
  } catch(error) { await c.query("ROLLBACK"); throw error; } finally { c.release(); }
}

export async function administerVisit(b:any,email:string) {
  if(!uuid.test(b?.id || '') || !Number.isInteger(b.version) || !['admin_edit','admin_delete'].includes(b.action))throw new AdminInputError('Visita inválida.');
  const c=await database().connect();
  try {
    await c.query('BEGIN READ WRITE');
    const user=await visitIdentity(c,email.toLowerCase());
    if (!canManageVisits(user.role)) throw new Forbidden();

    const old=(await c.query('SELECT * FROM web_sales_visits WHERE id=$1 FOR UPDATE',[b.id])).rows[0];
    if(!old || old.version!==b.version)throw new AdminInputError('Visita alterada ou excluída. Atualize a lista.');
    let after=null;
    if(b.action==='admin_delete'){await syncVisitTask(c,b.id,email,false,undefined,true);await c.query('DELETE FROM web_sales_visits WHERE id=$1',[b.id]);}
    else {
      const at=instant(b.scheduled_at),contact=text(b,'contact',160,true),phone=text(b,'phone',40,true),description=text(b,'description',10000);
      if(!/^[+()\d\s.-]{8,40}$/.test(phone))throw new AdminInputError('Informe um telefone válido.');
      const purpose=b.purpose_id || null;
      if(purpose!==null && (!/^\d+$/.test(String(purpose)) || !(await c.query('SELECT 1 FROM web_sales_visit_purposes WHERE id=$1 AND (active OR id=$2)',[purpose,old.purpose_id])).rows.length))throw new AdminInputError('Selecione uma finalidade ativa.');
      if(!purpose && old.purpose_id)throw new AdminInputError('Selecione a finalidade da visita.');
      const completed=old.status==='completed'?instant(b.completed_at):null;
      if(completed && completed.getTime()>Date.now())throw new AdminInputError('A realização não pode ter data futura.');
      const outcome=old.status==='completed'?text(b,'outcome',10000,true):old.outcome;
      after=(await c.query(`UPDATE web_sales_visits SET scheduled_at=$2,contact=$3,phone=$4,description=$5,purpose_id=$6,completed_at=$7,outcome=$8,version=version+1,updated_at=now() WHERE id=$1 RETURNING *`,[b.id,at,contact,phone,description,purpose,completed,outcome])).rows[0];
    }
    if(after)await syncVisitTask(c,b.id,email);
    await c.query("INSERT INTO web_access_events(event,email,actor,details) VALUES('sales_visit_admin',$1,$1,$2)",[email,JSON.stringify({action:b.action,before:old,after})]);
    await c.query('COMMIT');
  }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
}

export async function disqualifyVisitCustomer(body:any,email:string) {
  const key=text(body,"customer_key",120,true), reason=text(body,"reason",2000,true);
  const c=await database().connect();
  try {
    await c.query("BEGIN READ WRITE");
    const data=await visitsData(email.toLowerCase(),c);
    if(!data.customers.some(customer=>customer.key===key)) throw new Forbidden();
    const result=await c.query("INSERT INTO web_sales_disqualifications(customer_key,reason,actor) VALUES($1,$2,$3) ON CONFLICT(customer_key) DO NOTHING RETURNING customer_key",[key,reason,email.toLowerCase()]);
    if(result.rows.length) await c.query("INSERT INTO web_access_events(event,email,actor,details) VALUES('sales_disqualification',$1,$1,$2)",[email.toLowerCase(),JSON.stringify({customer_key:key,reason})]);
    await c.query("COMMIT");
  } catch(error) {await c.query("ROLLBACK");throw error;} finally {c.release();}
}

export async function restoreVisitCustomer(body:any,email:string) {
  const key=text(body,"customer_key",120,true);
  email=email.toLowerCase();
  const c=await database().connect();
  try {
    await c.query("BEGIN READ WRITE");
    const data=await visitsData(email,c);
    if(!data.customers.some(customer=>customer.key===key)) throw new Forbidden();
    const result=await c.query("DELETE FROM web_sales_disqualifications WHERE customer_key=$1 RETURNING *",[key]);
    if(result.rows.length) await c.query("INSERT INTO web_access_events(event,email,actor,details) VALUES('sales_customer_restored',$1,$1,$2)",[email,JSON.stringify({customer_key:key,previous:result.rows[0]})]);
    await c.query("COMMIT");
  }catch(error){await c.query("ROLLBACK");throw error;}finally{c.release();}
}
