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
    const header = [
      r.manufacturer,
      r.model,
      ...(r.serial ? [r.serial] : []),
      ...(r.modelOnly === "Sim" ? ["Aplicação somente por modelo"] : []),
      ...(r.conditions ? [r.conditions] : []),
    ];
    const reference = r.internalCode ? `M8:${r.internalCode}` : r.reference;
    const observation = [
      r.quantity && `Quantidade na lista: ${r.quantity}.`,
      r.drawingCode && `Código da vista: ${r.drawingCode}.`,
      r.saleFactor &&
        `Percentual venda (médio), valor original: ${r.saleFactor}.`,
      r.internalCode &&
        r.reference &&
        `Referência fabricante informada: ${r.reference}.`,
      r.observation,
    ]
      .filter(Boolean)
      .join(" ");
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
          normalizeCode(reference),
          Number(r.interval),
          observation,
        ]),
      );
    entries.set(entryId, {
      id: entryId,
      variant_id: id,
      section: r.section,
      description: r.description,
      code_original: reference,
      code: normalizeCode(reference),
      observation,
      interval_original: r.interval,
      interval_hours: r.interval ? Number(r.interval) : null,
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
    const internalIds = [
      ...new Set(validation.records.map((r) => r.internalCode).filter(Boolean)),
    ];
    if (internalIds.length) {
      const found = (
        await client.query(
          "SELECT DISTINCT product_id::text AS id FROM m8_product_catalog WHERE product_id=ANY($1::bigint[]) AND company_id IN(1,2,27404)",
          [internalIds],
        )
      ).rows.map((r) => r.id);
      if (internalIds.some((id) => !found.includes(id)))
        throw new CatalogInputError(
          "Código M8 não encontrado na base de produtos.",
        );
    }
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

const editFields = [
  "section",
  "description",
  "code_original",
  "interval_original",
  "observation",
] as const;
export async function updateCatalogItem(input: any, email: string) {
  if (
    !input ||
    typeof input.id !== "string" ||
    input.id.length > 200 ||
    !input.previous
  )
    throw new CatalogInputError("Item inválido. Atualize a lista.");
  const values: Record<string, string> = {};
  for (const key of editFields) {
    if (
      typeof input[key] !== "string" ||
      input[key].length > (key === "observation" ? 4000 : 500)
    )
      throw new CatalogInputError("Confira o tamanho dos campos.");
    values[key] = input[key].trim();
  }
  if (!values.section || !values.description)
    throw new CatalogInputError("Informe grupo e descrição.");
  const client = await database().connect();
  try {
    await client.query("BEGIN READ WRITE");
    await client.query("SELECT pg_advisory_xact_lock(81015,1)");
    const old = (
      await client.query(
        `SELECT e.*,v.revision_id FROM manufacturer_entries e JOIN manufacturer_variants v ON v.id=e.variant_id JOIN manufacturer_revisions r ON r.id=v.revision_id WHERE e.id=$1 AND (r.active OR r.report->>'managed'='true') FOR UPDATE OF e`,
        [input.id],
      )
    ).rows[0];
    if (!old)
      throw new CatalogInputError("Item não encontrado no catálogo atual.");
    if (editFields.some((k) => input.previous[k] !== old[k]))
      throw new CatalogInputError(
        "Este item foi alterado por outro usuário. Atualize a lista antes de editar.",
      );
    let code = old.code,
      hours = old.interval_hours;
    if (values.code_original !== old.code_original) {
      code = values.code_original ? normalizeCode(values.code_original) : null;
      if (
        code &&
        !/^(?:M8:[1-9]\d{0,18}|(?=[A-Z0-9]*\d)[A-Z0-9]{6,24})$/.test(code)
      )
        throw new CatalogInputError(
          "Use uma referência genuína de 6 a 24 caracteres ou M8: seguido do código interno.",
        );
      if (
        code?.startsWith("M8:") &&
        !(
          await client.query(
            "SELECT 1 FROM m8_product_catalog WHERE product_id=$1 AND company_id IN(1,2,27404) LIMIT 1",
            [code.slice(3)],
          )
        ).rowCount
      )
        throw new CatalogInputError(
          "Código interno não encontrado na base M8.",
        );
    }
    if (values.interval_original !== old.interval_original) {
      if (
        values.interval_original &&
        (!/^\d+$/.test(values.interval_original) ||
          Number(values.interval_original) < 1 ||
          Number(values.interval_original) > 100000)
      )
        throw new CatalogInputError(
          "Informe o intervalo entre 1 e 100000 horas ou deixe em branco.",
        );
      hours = values.interval_original
        ? Number(values.interval_original)
        : null;
    }
    const saved = (
      await client.query(
        `UPDATE manufacturer_entries SET section=$2,description=$3,code_original=$4,code=$5,interval_original=$6,interval_hours=$7,observation=$8 WHERE id=$1 RETURNING *`,
        [
          input.id,
          values.section,
          values.description,
          values.code_original,
          code,
          values.interval_original,
          hours,
          values.observation,
        ],
      )
    ).rows[0];
    await client.query(
      `UPDATE manufacturer_revisions SET report=jsonb_set(report,'{itemEdits}',COALESCE(report->'itemEdits','[]'::jsonb) || $2::jsonb) WHERE id=$1`,
      [
        old.revision_id,
        JSON.stringify([
          {
            item: input.id,
            email,
            at: new Date().toISOString(),
            before: Object.fromEntries(editFields.map((k) => [k, old[k]])),
            after: values,
          },
        ]),
      ],
    );
    await client.query("COMMIT");
    return { item: saved };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
