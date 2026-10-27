import { schemas, maintenanceSchema, type EntitySchema } from './schema.js';
import { mapEntity, upsert } from './ordensServico.repository.js';
import { transaction, type Database } from './postgres.js';
import { id } from '../m8/ordemServico.js';
import { collectionNames, type Children, type Collection, type HeaderSnapshot } from '../m8/collections.js';
import { safeError } from '../utils/logger.js';

const childSchemas: Record<Collection, EntitySchema> = {
  produtos: schemas[1], servicos: schemas[2], apontamentos: schemas[3], equipamentos: schemas[4],
  checklistRespostas: schemas[5], anexos: schemas[6], manutencoes: maintenanceSchema,
};
export class CycleRepository {
  constructor(readonly db: Database, readonly company: number, readonly timeZone: string) {}
  async ingestHeaders(headers: HeaderSnapshot[], seenAt: Date) {
    const columns = ['company_id','id_m8', ...schemas[0].fields.map(field => field[0]), 'payload'];
    const update = schemas[0].fields.map(([column,field]) => `${column}=CASE WHEN EXCLUDED.payload ? '${field}' THEN EXCLUDED.${column} ELSE m8_ordens_servico.${column} END`);
    let changedCount = 0;
    for (let offset = 0; offset < headers.length; offset += 1000) {
      const batch = headers.slice(offset, offset + 1000).map(({header,fiscalDocumentIds}) => ({
        ...mapEntity(schemas[0],header,this.company,undefined,this.timeZone),payload:header,fiscalDocumentIds,
      }));
      await transaction(this.db, async () => {
        const changed = await this.db.query<{id_m8:string;status:string}>(`INSERT INTO public.m8_ordens_servico (${columns.join(',')})
          SELECT ${columns.join(',')} FROM jsonb_populate_recordset(NULL::public.m8_ordens_servico,$1::jsonb)
          ON CONFLICT(company_id,id_m8) DO UPDATE SET ${update.join(',')},
          payload=m8_ordens_servico.payload || EXCLUDED.payload,sincronizado_em=now(),updated_at=now()
          WHERE (m8_ordens_servico.data_atualizacao IS NULL OR
            (EXCLUDED.data_atualizacao IS NOT NULL AND EXCLUDED.data_atualizacao>=m8_ordens_servico.data_atualizacao))
            AND NOT (m8_ordens_servico.payload - 'documentoFiscalId') @> (EXCLUDED.payload - 'documentoFiscalId')
          RETURNING id_m8,status`, [JSON.stringify(batch)]);
        changedCount += changed.rows.length;
        if (changed.rows.length) await this.db.query(`INSERT INTO integracao_m8_os_sync(company_id,ordem_servico_id,summary_status,inventory_seen_at)
          SELECT $1,id_m8,status,$3 FROM jsonb_to_recordset($2::jsonb) AS r(id_m8 bigint,status text)
          ON CONFLICT(company_id,ordem_servico_id) DO UPDATE SET
          summary_status=EXCLUDED.summary_status,inventory_seen_at=EXCLUDED.inventory_seen_at,
          pending=true,finalized=false,next_attempt_at=now()`,[this.company,JSON.stringify(changed.rows),seenAt]);
        await this.db.query(`INSERT INTO public.m8_os_documentos_fiscais(company_id,ordem_servico_id,documento_fiscal_id)
          SELECT (r->>'company_id')::integer,(r->>'id_m8')::bigint,d::bigint
          FROM jsonb_array_elements($1::jsonb) r CROSS JOIN LATERAL jsonb_array_elements_text(r->'fiscalDocumentIds') d
          ON CONFLICT(company_id,ordem_servico_id,documento_fiscal_id) DO UPDATE SET sincronizado_em=now()`,[JSON.stringify(batch)]);
      });
    }
    // Daily safety sweep also catches child-only changes not reflected by the ERP header.
    await this.db.query(`UPDATE integracao_m8_os_sync SET pending=true,finalized=false,next_attempt_at=now()
      WHERE company_id=$1 AND NOT pending AND (last_detail_at IS NULL OR last_detail_at<now()-interval '24 hours')`,[this.company]);
    return changedCount;
  }
  async next(): Promise<string | null> {
    const { rows } = await this.db.query<{ ordem_servico_id: string }>(`SELECT ordem_servico_id FROM public.integracao_m8_os_sync
      WHERE company_id=$1 AND pending AND next_attempt_at<=now()
      ORDER BY (last_detail_at IS NULL) DESC,
        (inventory_seen_at>last_detail_at) DESC, last_detail_at ASC NULLS FIRST,ordem_servico_id LIMIT 1`, [this.company]);
    return rows[0] ? String(rows[0].ordem_servico_id) : null;
  }
  async start(orderId: string) {
    await this.db.query(`UPDATE public.integracao_m8_os_sync SET attempts=attempts+1,last_attempt_at=now(),
      collections=$3::jsonb,error=NULL WHERE company_id=$1 AND ordem_servico_id=$2`,
    [this.company, orderId, JSON.stringify(Object.fromEntries(collectionNames.map(name => [name, 'PENDENTE'])))]);
  }
  async persist(snapshot: HeaderSnapshot, children: Children, final: boolean, changed: boolean, logId: string) {
    const { header, fiscalDocumentIds } = snapshot;
    const parent = id(header.id);
    await transaction(this.db, async () => {
      const mapped = mapEntity(schemas[0], header, this.company, undefined, this.timeZone);
      const current = (await this.db.query<{data_atualizacao:Date|null}>(
        'SELECT data_atualizacao FROM m8_ordens_servico WHERE company_id=$1 AND id_m8=$2 FOR UPDATE',[this.company,parent])).rows[0];
      if (current?.data_atualizacao && (!mapped.data_atualizacao ||
          new Date(String(mapped.data_atualizacao)).getTime()<new Date(current.data_atualizacao).getTime())) {
        await this.db.query("UPDATE integracao_m8_os_sync SET pending=true,finalized=false,next_attempt_at=now()+interval '1 minute' WHERE company_id=$1 AND ordem_servico_id=$2",[this.company,parent]);
        return;
      }
      await upsert(this.db, schemas[0].table, mapped, ['company_id','id_m8']);
      for (const documentId of fiscalDocumentIds) {
        await this.db.query(`INSERT INTO public.m8_os_documentos_fiscais(company_id,ordem_servico_id,documento_fiscal_id)
          VALUES($1,$2,$3) ON CONFLICT(company_id,ordem_servico_id,documento_fiscal_id) DO UPDATE SET sincronizado_em=now()`, [this.company,parent,documentId]);
      }
      for (const name of collectionNames) {
        const schema = childSchemas[name];
        for (const source of children[name]) {
          await upsert(this.db, schema.table, mapEntity(schema, source, this.company, parent, this.timeZone), ['company_id','ordem_servico_id','id_m8']);
        }
      }
      await this.db.query(`UPDATE public.integracao_m8_os_sync SET finalized=$3 AND NOT (inventory_seen_at>COALESCE(last_attempt_at,inventory_seen_at)),pending=$4 OR (inventory_seen_at>COALESCE(last_attempt_at,inventory_seen_at)),last_detail_at=now(),
        next_attempt_at=now()+CASE WHEN $4 THEN interval '1 minute' ELSE interval '0' END,
        summary_status=$5,collections=$6::jsonb,error=NULL WHERE company_id=$1 AND ordem_servico_id=$2`,
      [this.company, parent, final, changed, header.status, JSON.stringify(Object.fromEntries(collectionNames.map(name => [name, 'CONCLUIDO'])))]);
      await this.db.query(`UPDATE public.integracao_m8_log SET pagina_atual=$2,paginas_processadas=paginas_processadas+1,
        registros_recebidos=registros_recebidos+1,registros_atualizados=registros_atualizados+1 WHERE id=$1`, [logId, parent]);
    });
  }
  async fail(orderId: string, error: unknown, collections: Record<string,string>) {
    await this.db.query(`UPDATE public.integracao_m8_os_sync SET pending=true,finalized=false,error=$3,
      collections=$4::jsonb,next_attempt_at=now()+interval '30 minutes' WHERE company_id=$1 AND ordem_servico_id=$2`,
    [this.company, orderId, safeError(error), JSON.stringify(collections)]);
  }
  async pendingCount(): Promise<number> {
    const { rows } = await this.db.query<{ count: number }>('SELECT count(*)::int AS count FROM public.integracao_m8_os_sync WHERE company_id=$1 AND pending', [this.company]);
    return rows[0]!.count;
  }
}
