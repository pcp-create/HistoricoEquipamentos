import "server-only";
import { createHash } from "node:crypto";
import { database } from "../db";
import { fold, modelKeys, normalizeCode } from "./rules";
import { validateCatalogRecords } from "./configuration";
export class CatalogInputError extends Error {}
const revisionId = "catalogo-cadastrado-no-sistema";
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
export async function catalogConfiguration() {
  const versions = (
    await database()
      .query(`SELECT v.id,v.name,v.header,v.models,v.rules,v.issues,r.filename,r.imported_at,
    count(e.id)::int AS items FROM manufacturer_variants v JOIN manufacturer_revisions r ON r.id=v.revision_id
    LEFT JOIN manufacturer_entries e ON e.variant_id=v.id
    WHERE r.active OR r.report->>'managed'='true'
    GROUP BY v.id,r.id ORDER BY v.name`)
  ).rows;
  return { versions };
}
export async function catalogConfigurationItems(variant: string) {
  return (
    await database().query(
      `SELECT e.* FROM manufacturer_entries e JOIN manufacturer_variants v ON v.id=e.variant_id
    JOIN manufacturer_revisions r ON r.id=v.revision_id WHERE e.variant_id=$1 AND (r.active OR r.report->>'managed'='true') ORDER BY e.row_number`,
      [variant],
    )
  ).rows;
}
export async function saveCatalogRecords(input: unknown, email: string) {
  const validation = validateCatalogRecords(input);
  if (validation.errors.length)
    throw new CatalogInputError(validation.errors.join("\n"));
  const variants = new Map<
    string,
    {
      id: string;
      name: string;
      header: string[];
      models: string[];
      rules: { model: string; serial: string }[];
    }
  >();
  const entries = new Map<string, Record<string, unknown>>();
  for (const r of validation.records) {
    const id =
      "managed:" + hash(fold([r.manufacturer, r.model, r.version].join("|")));
    const header = [r.manufacturer, r.model, ...(r.serial ? [r.serial] : [])];
    variants.set(id, {
      id,
      name: `${r.manufacturer} · ${r.model} · ${r.version}`,
      header,
      models: modelKeys(r.model).length ? modelKeys(r.model) : [fold(r.model)],
      rules: r.serial ? [{ model: r.model, serial: r.serial }] : [],
    });
    const entryId =
      "managed:" +
      hash(
        JSON.stringify([
          id,
          fold(r.section),
          fold(r.description),
          normalizeCode(r.reference),
          Number(r.interval),
          r.observation,
        ]),
      );
    entries.set(entryId, {
      id: entryId,
      variant_id: id,
      section: r.section,
      description: r.description,
      code_original: r.reference,
      code: normalizeCode(r.reference),
      observation: r.observation,
      interval_original: r.interval,
      interval_hours: Number(r.interval),
    });
  }
  const client = await database().connect();
  try {
    await client.query("BEGIN READ WRITE");
    await client.query("SELECT pg_advisory_xact_lock(81015,1)");
    await client.query(
      `INSERT INTO manufacturer_revisions(id,filename,report) VALUES($1,'Cadastros adicionais do sistema',$2) ON CONFLICT DO NOTHING`,
      [revisionId, JSON.stringify({ managed: true })],
    );
    const existing = (
      await client.query(
        "SELECT id,header FROM manufacturer_variants WHERE id=ANY($1::text[])",
        [[...variants.keys()]],
      )
    ).rows;
    for (const old of existing) {
      const version = variants.get(old.id)!;
      if (
        fold(JSON.stringify(old.header)) !==
        fold(JSON.stringify(version.header))
      )
        throw new CatalogInputError(
          `A versão ${version.name} já existe com outra faixa de série. Cadastre uma versão diferente.`,
        );
    }
    await client.query(
      `INSERT INTO manufacturer_variants(id,revision_id,name,header,models,rules,issues)
      SELECT p.id,$1,p.name,p.header,p.models,p.rules,'[]'::jsonb FROM jsonb_to_recordset($2::jsonb) AS p(id text,name text,header jsonb,models jsonb,rules jsonb) ON CONFLICT DO NOTHING`,
      [revisionId, JSON.stringify([...variants.values()])],
    );
    const result = await client.query(
      `WITH input AS (
      SELECT * FROM jsonb_to_recordset($1::jsonb) AS p(id text,variant_id text,section text,description text,code_original text,code text,observation text,interval_original text,interval_hours numeric)
    ), numbered AS (
      SELECT p.*,COALESCE((SELECT max(e.row_number) FROM manufacturer_entries e WHERE e.variant_id=p.variant_id),0)+row_number() OVER(PARTITION BY p.variant_id ORDER BY p.id) AS line FROM input p
    ) INSERT INTO manufacturer_entries(id,variant_id,sheet,row_number,section,description,code_original,code,observation,interval_original,interval_hours,issues)
      SELECT id,variant_id,'Cadastro',line::integer,section,description,code_original,code,observation,interval_original,interval_hours,'[]'::jsonb FROM numbered ON CONFLICT(id) DO NOTHING`,
      [JSON.stringify([...entries.values()])],
    );
    await client.query(
      `UPDATE manufacturer_revisions SET imported_at=now(),report=report || $2::jsonb WHERE id=$1`,
      [
        revisionId,
        JSON.stringify({
          lastEditor: email,
          lastBatch: validation.records.length,
        }),
      ],
    );
    await client.query("COMMIT");
    const inserted = result.rowCount || 0;
    return { inserted, skipped: validation.records.length - inserted };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
