import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
type Database = Pick<PoolClient, 'query'>;
import { geocodeLocality } from './geocode';
import { addressIdentity, validPoint, type Locality } from './map-model';
async function transaction<T>(db: Database, work:()=>Promise<T>) {
 await db.query('BEGIN READ WRITE');
 try {const value=await work();await db.query('COMMIT');return value;}
 catch(error){await db.query('ROLLBACK');throw error;}
}
const hash = (a: Locality) => createHash('sha256').update(addressIdentity(a)).digest('hex');
/** Runs after address synchronization, including cycles with no newly changed customers. */
export async function geocodePendingLocalities(db: Database, options: {
  key?: string; limit?: number; shouldStop?: () => boolean; locate?: typeof geocodeLocality;
} = {}) {
  const key = options.key ?? process.env.GEOAPIFY_API_KEY;
  const result = { updated: 0, failed: 0, skipped: 0, configured: !!key };
  if (!key) return result;
  const available = (await db.query("SELECT to_regclass('public.web_customer_map_points') IS NOT NULL AND to_regclass('public.m8_locality_geocoding_attempts') IS NOT NULL AS ok")).rows[0]?.ok;
  if (!available) return {...result, configured: false};

    const rows = (await db.query<Locality & {saved_hash: string; retry_hash: string; retry_due: boolean}>(`
      SELECT l.person_id,l.address_id,l.street,l.number,l.letter,l.complement,l.district,l.city,l.state,l.postal_code,l.country,
       p.address_hash saved_hash,p.latitude,p.longitude,
       a.address_hash retry_hash,(a.next_at IS NULL OR a.next_at<=now()) retry_due
      FROM m8_customer_localities l
      LEFT JOIN web_customer_map_points p USING(person_id,address_id)
      LEFT JOIN m8_locality_geocoding_attempts a USING(person_id,address_id)
      WHERE l.company_id=1 AND l.present
      ORDER BY EXISTS(SELECT 1 FROM web_service_schedules s JOIN m8_ordens_servico o
        ON o.company_id=s.company_id AND o.id_m8=s.order_id
        WHERE s.active AND o.cliente_id=l.person_id) DESC,
       a.attempted_at NULLS FIRST,l.person_id,l.address_id`)).rows;
    let attempted = 0;
    for (const address of rows) {
      if (options.shouldStop?.() || attempted >= (options.limit ?? 25)) break;
      const identity = hash(address);
      if (address.saved_hash === identity && validPoint(address.latitude,address.longitude)) continue;
      if (address.retry_hash === identity && !address.retry_due) continue;
      attempted++;
      // Record a retry deadline before the request, so a crash cannot cause a tight retry loop.
      const claim = await transaction(db,()=>db.query(`INSERT INTO m8_locality_geocoding_attempts(person_id,address_id,address_hash,next_at)
        VALUES($1,$2,$3,now()+interval '1 hour') ON CONFLICT(person_id,address_id) DO UPDATE
        SET address_hash=$3,attempted_at=now(),next_at=now()+interval '1 hour'
        WHERE m8_locality_geocoding_attempts.address_hash<>$3 OR m8_locality_geocoding_attempts.next_at<=now() RETURNING person_id`,[address.person_id,address.address_id,identity]));
      if (!claim.rows.length) continue;
      try {
        const point = await (options.locate ?? geocodeLocality)(address,key);
        await transaction(db, async () => {
          const current=(await db.query<Locality>(`SELECT * FROM m8_customer_localities
            WHERE company_id=1 AND person_id=$1 AND address_id=$2 AND present FOR SHARE`,[address.person_id,address.address_id])).rows[0];
          if (!current || hash(current)!==identity) {result.skipped++;return;}
          const saved=await db.query(`INSERT INTO web_customer_map_points(person_id,address_id,address_hash,latitude,longitude,precision,provider,updated_by)
            VALUES($1,$2,$3,$4,$5,$6,$7,'integrador-localidades') ON CONFLICT(person_id,address_id) DO UPDATE
            SET address_hash=EXCLUDED.address_hash,latitude=EXCLUDED.latitude,longitude=EXCLUDED.longitude,
            precision=EXCLUDED.precision,provider=EXCLUDED.provider,updated_by=EXCLUDED.updated_by,updated_at=now()
            WHERE web_customer_map_points.address_hash<>EXCLUDED.address_hash RETURNING person_id`,
            [address.person_id,address.address_id,identity,point.latitude,point.longitude,point.precision,point.provider]);
          if(saved.rows.length)result.updated++;else result.skipped++;
          await db.query('DELETE FROM m8_locality_geocoding_attempts WHERE person_id=$1 AND address_id=$2',[address.person_id,address.address_id]);
        });
      } catch {result.failed++;}
    }
    return result;
}
