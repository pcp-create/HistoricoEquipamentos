import { geocodeLocality, GeocodeError } from "./geocode";
import "server-only";
import { createHash } from "node:crypto";
import { database } from "../db";
import { Forbidden } from "../auth";
import {
  addressIdentity,
  chooseLocality,
  validPoint,
  type Locality,
} from "./map-model";
export class MapInputError extends Error {}
const hash = (a: Locality) =>
  createHash("sha256").update(addressIdentity(a)).digest("hex");
export async function scheduleMapData(email: string, db: any = database()) {
  const access = (
    await db.query("SELECT role,enabled FROM web_user_access WHERE email=$1", [
      email,
    ])
  ).rows[0];
  if (!access?.enabled || access.role !== "admin") throw new Forbidden();
  const rows = (
    await db.query(`SELECT s.id::text,o.cliente_id::text AS person_id,o.endereco_entrega_id::text AS delivery_id,
 c.address_id::text AS choice_id
 FROM web_service_schedules s JOIN m8_ordens_servico o ON o.company_id=s.company_id AND o.id_m8=s.order_id
 LEFT JOIN web_schedule_map_choices c ON c.schedule_id=s.id AND c.person_id=o.cliente_id
 WHERE s.active`)
  ).rows;
  const addresses = (
    await db.query(
      `SELECT l.person_id::text,l.address_id::text,l.address_type,l.street,l.number,l.letter,l.complement,l.district,l.city,l.state,l.postal_code,l.country,
 p.address_hash,p.latitude,p.longitude,p.precision,p.provider
 FROM m8_customer_localities l LEFT JOIN web_customer_map_points p ON p.person_id=l.person_id AND p.address_id=l.address_id
 WHERE l.company_id=1 AND l.present AND l.person_id=ANY($1::bigint[])`,
      [[...new Set(rows.map((r: any) => r.person_id).filter(Boolean))]],
    )
  ).rows.map((a: any) => {
    if (a.address_hash !== hash(a))
      return {
        ...a,
        latitude: null,
        longitude: null,
        precision: null,
        provider: null,
      };
    return a;
  });
  return {
    geocodingAvailable: !!process.env.GEOAPIFY_API_KEY,
    schedules: rows.map((r: any) => {
      const localities = addresses.filter(
        (a: any) => a.person_id === r.person_id,
      );
      const selected = chooseLocality(localities, r.delivery_id, r.choice_id);
      return {
        id: r.id,
        localities,
        selectedAddressId: selected.address?.address_id || null,
        reason: selected.reason,
      };
    }),
  };
}
export async function changeScheduleMap(body: any, email: string) {
  if (
    !body ||
    !["select", "manual", "geocode"].includes(body.action) ||
    !/^\d{1,18}$/.test(String(body.scheduleId)) ||
    !/^\d{1,18}$/.test(String(body.addressId))
  )
    throw new MapInputError("Dados da localidade inválidos.");
  const db = database(),
    data = await scheduleMapData(email);
  const schedule = data.schedules.find(
    (s: any) => s.id === String(body.scheduleId),
  );
  const address: Locality | undefined = schedule?.localities.find(
    (a: Locality) => a.address_id === String(body.addressId),
  );
  if (!address)
    throw new MapInputError(
      "Localidade não pertence ao cliente desta OS ou não está mais disponível.",
    );
  let point: {
    latitude: number;
    longitude: number;
    precision: string;
    provider: string;
  } | null = null;
  if (body.action === "manual") {
    if (!validPoint(body.latitude, body.longitude))
      throw new MapInputError("Informe latitude e longitude válidas.");
    point = {
      latitude: body.latitude,
      longitude: body.longitude,
      precision: "confirmed",
      provider: "manual",
    };
  }
  if (body.action === "geocode") {
    if (validPoint(address.latitude, address.longitude)) return data;
    if (!process.env.GEOAPIFY_API_KEY)
      throw new MapInputError(
        "A busca automática de endereços ainda não foi configurada. Você pode marcar o local no mapa.",
      );
    try {
      point = await geocodeLocality(address, process.env.GEOAPIFY_API_KEY);
    } catch (e) {
      throw new MapInputError(
        e instanceof GeocodeError
          ? e.message
          : "Falha ao consultar o serviço de localização. Tente novamente.",
      );
    }
  }

  const c = await db.connect();
  try {
    await c.query("BEGIN READ WRITE");
    const allowed = (
      await c.query(
        "SELECT role,enabled FROM web_user_access WHERE email=$1 FOR SHARE",
        [email],
      )
    ).rows[0];
    if (!allowed?.enabled || allowed.role !== "admin") throw new Forbidden();
    const current = (
      await c.query(
        `SELECT l.* FROM web_service_schedules s JOIN m8_ordens_servico o ON o.company_id=s.company_id AND o.id_m8=s.order_id
   JOIN m8_customer_localities l ON l.company_id=1 AND l.person_id=o.cliente_id AND l.address_id=$2 AND l.present
   WHERE s.id=$1 AND s.active FOR SHARE OF s,o,l`,
        [body.scheduleId, body.addressId],
      )
    ).rows[0];
    if (!current || hash(current) !== hash(address))
      throw new MapInputError(
        "O endereço mudou. Atualize a tela e tente novamente.",
      );
    if (point)
      await c.query(
        `INSERT INTO web_customer_map_points(person_id,address_id,address_hash,latitude,longitude,precision,provider,updated_by)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(person_id,address_id) DO UPDATE SET address_hash=EXCLUDED.address_hash,latitude=EXCLUDED.latitude,longitude=EXCLUDED.longitude,precision=EXCLUDED.precision,provider=EXCLUDED.provider,updated_by=EXCLUDED.updated_by,updated_at=now()`,
        [
          address.person_id,
          address.address_id,
          hash(address),
          point.latitude,
          point.longitude,
          point.precision,
          point.provider,
          email,
        ],
      );
    await c.query(
      `INSERT INTO web_schedule_map_choices(schedule_id,person_id,address_id,updated_by) VALUES($1,$2,$3,$4)
   ON CONFLICT(schedule_id) DO UPDATE SET person_id=EXCLUDED.person_id,address_id=EXCLUDED.address_id,updated_by=EXCLUDED.updated_by,updated_at=now()`,
      [body.scheduleId, address.person_id, address.address_id, email],
    );
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
  return scheduleMapData(email);
}
