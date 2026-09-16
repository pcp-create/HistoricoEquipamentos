import { catalogProductCodesSql } from "../manufacturer/direct-products";
import { approvedMaterialSql } from "../material-approval";
import "server-only";
import { quoteProducts } from "./products";
import { quoteCatalog } from "./catalog";
import { createHash } from "node:crypto";
import { database } from "../db";
import { manufacturerCatalog, manualFilters } from "../manufacturer/catalog";
import { intervalInfo, matchesInterval } from "../manufacturer/intervals";
import { normalizeSerial } from "../manufacturer/rules";
import { sameUnit } from "../product-values";
import { currentProducts } from "../product-current";
import type {
  ManufacturerRecommendation,
  QuoteItem,
  QuoteSalesHistory,
} from "./types";
import { QuoteValidation } from "./types";

const numeric = (v: unknown) =>
  v == null || !Number.isFinite(Number(v)) || Number(v) < 0 ? "" : String(v);
const date = (v: unknown) =>
  v instanceof Date ? v.toISOString() : String(v || "");
function item(
  kind: QuoteItem["kind"],
  key: string,
  code: string,
  name: string,
  unit: string,
  source: string,
): QuoteItem {
  return {
    kind,
    key:
      key.length > 200
        ? kind + ":" + createHash("sha256").update(key).digest("hex")
        : key,
    code: code.slice(0, 100),
    name: name.slice(0, 500),
    unit: unit.slice(0, 60),
    source: source.slice(0, 2000),
    quantity: "1",
    price: "",
    selected: false,
    referencePrice: "",
    minimumPrice: "",
    lastPrice: "",
    referenceAt: "",
  };
}
export async function quoteLookup(p: URLSearchParams): Promise<{
  rows?: Record<string, any>[];
  items?: QuoteItem[];
  truncated: boolean;
  page?: number;
}> {
  const c = "1",
    q = (p.get("q") || "").trim().slice(0, 120),
    db = database();
  const pattern = "%" + q.replace(/[\\%_]/g, "\\$&") + "%";
  if (p.get("lookup") === "clients") {
    const rows = (
      await db.query(
        `WITH clients AS (
 SELECT person_id AS id,name,document,company_id,0 AS priority FROM m8_customer_directory WHERE company_id IN(1,2,27404)
 UNION ALL SELECT cliente_id,cliente_nome,cliente_cpf_cnpj,company_id,1 FROM m8_ordens_servico WHERE company_id IN(1,2,27404) AND cliente_id IS NOT NULL
 ), distinct_clients AS (SELECT DISTINCT ON(id) id,name,document FROM clients ORDER BY id,priority,company_id)
 SELECT id::text,name,document FROM distinct_clients WHERE concat_ws(' ',name,document,id) ILIKE $1 ORDER BY name LIMIT 31`,
        [pattern],
      )
    ).rows;
    return { rows: rows.slice(0, 30), truncated: rows.length > 30 };
  }
  if (p.get("lookup") === "equipment") {
    const id = p.get("clientId") || "";
    if (!/^\d{1,20}$/.test(id)) return { rows: [], truncated: false };
    const rows = (
      await db.query(
        `WITH registry AS (
 SELECT DISTINCT e.equipment_id::text,e.name,COALESCE(e.model,'') AS model,COALESCE(e.serial,'') AS serial,e.serial_source,'Cadastro do cliente' AS source
 FROM m8_equipment_catalog e JOIN m8_person_equipment p ON p.equipment_id=e.equipment_id AND p.present
 WHERE e.present AND p.person_id=$1 AND p.company_id IN(1,2,27404)
 ), historical AS (
 SELECT COALESCE(o.produto_equipamento_id::text,'') AS equipment_id,COALESCE(NULLIF(o.equipamento,''),NULLIF(e.equipamento_modelo,''),o.modelo_equipamento,'Equipamento') AS name,
 COALESCE(NULLIF(e.equipamento_modelo,''),o.modelo_equipamento,'') AS model,
 COALESCE(NULLIF(e.numero_serie,''),NULLIF(o.numero_serie,''),o.serie,'') AS serial,NULL::text AS serial_source,'Histórico da OS' AS source
 FROM m8_ordens_servico o LEFT JOIN m8_equipamentos e ON e.company_id=o.company_id AND e.ordem_servico_id=o.id_m8
 WHERE o.company_id IN(1,2,27404) AND o.cliente_id=$1
 ), combined AS (SELECT * FROM registry UNION SELECT DISTINCT * FROM historical h WHERE NOT EXISTS(SELECT 1 FROM registry r WHERE r.serial<>'' AND r.serial=regexp_replace(upper(h.serial),'[^A-Z0-9]','','g')))
 SELECT * FROM combined WHERE concat_ws(' ',name,model,serial,equipment_id) ILIKE $2
 ORDER BY source,name,model,serial LIMIT 301`,
        [id, pattern],
      )
    ).rows;
    return { rows: rows.slice(0, 300), truncated: rows.length > 300 };
  }
  if (["materials", "services"].includes(p.get("lookup") || ""))
    return quoteCatalog(p);
  throw new QuoteValidation("Consulta inválida.");
}
function serviceItem(
  r: Record<string, any>,
  c: string,
  source: string,
): QuoteItem {
  const result = item(
    "service",
    `s:${c}:${r.servico_id || r.servico_nome}`,
    String(r.servico_id || ""),
    r.servico_nome || "Serviço sem descrição",
    "",
    "" + source,
  );
  result.lastPrice = numeric(
    Number(r.quantidade) > 0 && r.valor_total != null
      ? Number(r.valor_total) / Number(r.quantidade)
      : r.valor_unitario,
  );
  result.referenceAt = date(r.used_at);
  result.source += ` · Empresa ${r.company_id} · OS ${r.ordem_servico_id} · última quantidade: ${r.quantidade ?? "não informada"}`;
  return result;
}
export async function quoteSuggestions(p: URLSearchParams) {
  const c = "1",
    clientId = p.get("clientId") || "",
    serial =
      normalizeSerial(p.get("serial") || "") === "NC"
        ? ""
        : normalizeSerial(p.get("serial") || ""),
    equipmentId = p.get("equipmentId") || "";
  if (equipmentId && !/^\d{1,18}$/.test(equipmentId))
    throw new QuoteValidation("Equipamento inválido.");
  const recommendations: ManufacturerRecommendation[] = [];
  const histories: Record<string, QuoteSalesHistory> = {};
  const items = new Map<string, QuoteItem>(),
    warnings: string[] = [];
  const add = (value: QuoteItem) => {
    const old = items.get(value.key);
    if (old) {
      if (!old.source.includes(value.source))
        old.source = (old.source + "; " + value.source).slice(0, 2000);
      if (!old.referencePrice) old.referencePrice = value.referencePrice;
      if (!old.minimumPrice) old.minimumPrice = value.minimumPrice;
    } else items.set(value.key, value);
  };
  const db = database();
  if (/^\d{1,20}$/.test(clientId) && (serial || equipmentId)) {
    const serialPattern = serial
      ? `(^|[^A-Z0-9])${serial.split("").join("[[:space:]./-]*")}([^A-Z0-9]|$)`
      : "a^";
    const orders = `SELECT o.company_id,o.id_m8,COALESCE(o.numero_sequencia,o.id_m8) AS order_number,COALESCE(o.emissao,o.data_abertura) AS used_at,
      ($2<>'' AND upper(COALESCE(o.observacao,'')) ~ $4) AS observation_link
      FROM m8_ordens_servico o
    JOIN integracao_m8_os_sync sync ON sync.company_id=o.company_id AND sync.ordem_servico_id=o.id_m8
    WHERE o.company_id IN(1,2,27404) AND o.cliente_id=$1 AND o.status='Processado' AND sync.finalized IS TRUE AND sync.pending IS FALSE
    AND (($2<>'' AND (
      regexp_replace(upper(COALESCE(o.numero_serie,'')),'[^A-Z0-9]','','g')=$2
      OR regexp_replace(upper(COALESCE(o.serie,'')),'[^A-Z0-9]','','g')=$2
      OR upper(COALESCE(o.observacao,'')) ~ $4
      OR EXISTS(SELECT 1 FROM m8_equipamentos e WHERE e.company_id=o.company_id AND e.ordem_servico_id=o.id_m8 AND regexp_replace(upper(COALESCE(e.numero_serie,'')),'[^A-Z0-9]','','g')=$2)
      OR EXISTS(SELECT 1 FROM m8_equipment_linked l WHERE l.company_id=o.company_id AND l.order_id=o.id_m8 AND l.serial=$2)
    )) OR ($2='' AND $3<>'' AND (
      o.produto_equipamento_id::text=$3
      OR EXISTS(SELECT 1 FROM m8_equipment_linked l WHERE l.company_id=o.company_id AND l.order_id=o.id_m8 AND l.equipment_id::text=$3 AND l.method='explicit')
    )))`;
    // One row per product/unit and OS, even when the same product appears on several lines.
    // Windows retain the full price range while limiting the payload to five recent sales.
    const sales = (
      await db.query(
        `WITH os AS (${orders}), lines AS (
      SELECT 'material' AS kind,COALESCE(p.produto_id::text,p.produto_nome) AS identity,
        upper(trim(COALESCE(p.unidade_nome,''))) AS unit,p.company_id,p.ordem_servico_id,os.used_at,os.observation_link,os.order_number,
        p.quantidade AS quantity,p.valor_total AS total
      FROM os JOIN m8_os_produtos p ON p.company_id=os.company_id AND p.ordem_servico_id=os.id_m8
      WHERE p.esta_excluido IS NOT TRUE AND ${approvedMaterialSql("p")} AND p.quantidade>0
      UNION ALL
      SELECT 'service',COALESCE(s.servico_id::text,s.servico_nome),'',s.company_id,s.ordem_servico_id,os.used_at,os.observation_link,os.order_number,
        s.quantidade,COALESCE(s.valor_total,s.valor_unitario*s.quantidade)
      FROM os JOIN m8_os_servicos s ON s.company_id=os.company_id AND s.ordem_servico_id=os.id_m8
      WHERE s.quantidade>0
    ), sale AS (
      SELECT kind,identity,unit,company_id,ordem_servico_id,used_at,order_number,bool_or(observation_link) AS observation_link,sum(quantity) AS quantity,
        CASE WHEN count(total)=count(*) THEN sum(total) END AS total
      FROM lines GROUP BY kind,identity,unit,company_id,ordem_servico_id,used_at,order_number
    ), ranked AS (
      SELECT *,total/quantity AS unit_price,
        min(CASE WHEN total>=0 THEN total/quantity END) OVER w AS minimum,
        max(CASE WHEN total>=0 THEN total/quantity END) OVER w AS maximum,
        count(*) OVER w AS sale_count,
        row_number() OVER (PARTITION BY kind,identity,unit ORDER BY used_at DESC NULLS LAST,ordem_servico_id DESC,company_id) AS rank
      FROM sale WINDOW w AS (PARTITION BY kind,identity,unit)
    ) SELECT * FROM ranked WHERE rank<=5 ORDER BY kind,identity,unit,rank`,
        [clientId, serial, equipmentId, serialPattern],
      )
    ).rows;
    for (const r of sales) {
      const key = item(
        r.kind,
        r.kind === "material"
          ? `p:${c}:${r.identity}:${r.unit}`
          : `s:${c}:${r.identity}`,
        "",
        "",
        "",
        "",
      ).key;
      const history = (histories[key] ||= {
        count: Number(r.sale_count),
        minimum: numeric(r.minimum),
        maximum: numeric(r.maximum),
        rows: [],
      });
      history.rows.push({
        linkedByObservation: r.observation_link === true,
        company: String(r.company_id),
        order: String(r.ordem_servico_id),
        orderNumber: String(r.order_number),
        date: date(r.used_at),
        quantity: String(r.quantity),
        unitPrice: numeric(r.unit_price),
        total: numeric(r.total),
      });
    }
    const materials = (
      await db.query(
        `WITH os AS (${orders})
    SELECT DISTINCT ON (COALESCE(p.produto_id::text,p.produto_nome),p.unidade_nome) p.*,os.used_at,
      c.sale_price,c.minimum_price,c.unit AS current_unit,c.price_at
    FROM os JOIN m8_os_produtos p ON p.ordem_servico_id=os.id_m8 AND p.company_id=os.company_id
    LEFT JOIN m8_product_current c ON c.company_id=1 AND c.product_id=p.produto_id
    WHERE p.esta_excluido IS NOT TRUE AND ${approvedMaterialSql("p")} AND p.quantidade>0
    ORDER BY COALESCE(p.produto_id::text,p.produto_nome),p.unidade_nome,os.used_at DESC NULLS LAST,p.id_m8 DESC`,
        [clientId, serial, equipmentId, serialPattern],
      )
    ).rows;
    for (const r of materials) {
      const unit = r.unidade_nome || "";
      const v = item(
        "material",
        `p:${c}:${r.produto_id || r.produto_nome}:${unit.trim().toUpperCase()}`,
        String(r.produto_id || ""),
        r.produto_nome || "Material sem descrição",
        unit,
        `Histórico · Empresa ${r.company_id} · OS ${r.ordem_servico_id} · última quantidade: ${r.quantidade} · Ref.: ${r.referencia_fabricante || "—"} · Preços de cadastro: empresa 1`,
      );
      v.lastPrice = numeric(
        r.valor_total == null
          ? null
          : Number(r.valor_total) / Number(r.quantidade),
      );
      if (sameUnit(unit, r.current_unit)) {
        v.referencePrice = numeric(r.sale_price);
        v.minimumPrice = numeric(r.minimum_price);
      }
      v.referenceAt = date(r.price_at || r.used_at);
      add(v);
    }
    const services = (
      await db.query(
        `WITH os AS (${orders})
    SELECT DISTINCT ON (COALESCE(s.servico_id::text,s.servico_nome)) s.*,os.used_at FROM os
    JOIN m8_os_servicos s ON s.ordem_servico_id=os.id_m8 AND s.company_id=os.company_id
    ORDER BY COALESCE(s.servico_id::text,s.servico_nome),os.used_at DESC NULLS LAST,s.id_m8 DESC`,
        [clientId, serial, equipmentId, serialPattern],
      )
    ).rows;
    services.forEach((r) => add(serviceItem(r, c, "Histórico do equipamento")));
    warnings.push(
      "Histórico das empresas 1, 2 e 27404, restrito ao cliente e ao equipamento ou à série, em OS processadas com coleta concluída. Quantidades anteriores são referência, não consumo previsto. Se a OS contém várias máquinas, seus itens podem pertencer a outro equipamento da mesma OS.",
    );
  } else
    warnings.push(
      "Para sugerir pelo histórico, selecione um cliente e um equipamento cadastrado, ou informe uma série diferente de NC.",
    );
  let variants: any[] = [],
    intervals: any[] = [];
  {
    const manualParams = new URLSearchParams(p);
    manualParams.set("company", "1");
    if (serial.length < 4) manualParams.set("serial", "");
    const filters = manualFilters(manualParams);
    // A short/unavailable serial does not establish manufacturer applicability.
    const metadata = await manufacturerCatalog(
      { ...filters, serial: serial.length >= 4 ? filters.serial : "" },
      true,
    );
    variants = (metadata.allVariants || metadata.variants).map((v) => ({
      ...v,
      suggested:
        v.match === "match" || (Boolean(filters.model) && v.match === "review"),
    }));
    const manualSelection = !filters.model && !filters.serial;
    intervals = manualSelection && !filters.variant ? [] : metadata.intervals;
    const selected = filters.variant
      ? variants.filter((v) => v.id === filters.variant)
      : manualSelection
        ? []
        : metadata.variants;
    if (manualSelection && !filters.variant)
      warnings.push(
        "Selecione manualmente uma versão do fabricante para listar as peças e os intervalos da revisão.",
      );
    if (selected.length > 1)
      warnings.push(
        "Há várias versões do fabricante. Escolha a versão correta antes de selecionar peças.",
      );
    if (selected.some((v) => v.match !== "match"))
      warnings.push(
        "Confira a faixa de série e as condições do fabricante; a aplicação não foi confirmada automaticamente.",
      );
    const entries = (
      await db.query(
        `SELECT e.*,v.name AS variant_name FROM manufacturer_entries e
    JOIN manufacturer_variants v ON v.id=e.variant_id WHERE e.variant_id=ANY($1::text[]) ORDER BY v.name,e.row_number`,
        [selected.map((v) => v.id)],
      )
    ).rows.filter((e) => matchesInterval(e, filters.interval));
    const codes = [...new Set(entries.map((e) => e.code).filter(Boolean))];
    const products = (
      await db.query(
        `WITH matches AS (
          SELECT code,product_id,array_agg(DISTINCT field) AS fields
          FROM ${catalogProductCodesSql} AS indexed WHERE company_id IN (1,2,27404) AND code=ANY($1::text[])
          GROUP BY code,product_id
        )
        SELECT x.code,c.company_id,c.product_id::text,c.name,c.unit,
          c.payload->>'bloqueado' AS blocked,c.payload->>'referenciaFabricante' AS reference,
          c.payload->>'codigoSimilaridade' AS similarity,x.fields,
          ('referenciaFabricante'=ANY(x.fields)) AS genuine,
          p.sale_price,p.minimum_price,p.price_at,p.unit AS price_unit
        FROM matches x JOIN m8_product_catalog c ON c.product_id=x.product_id AND c.company_id IN (1,2,27404)
        LEFT JOIN m8_product_current p ON p.company_id=1 AND p.product_id=c.product_id
        ORDER BY ('referenciaFabricante'=ANY(x.fields)) DESC,c.product_id,c.company_id`,
        [codes],
      )
    ).rows;
    const balances = await currentProducts(products);
    for (const e of entries) {
      const source = `Fabricante · ${e.variant_name} · linha ${e.row_number} · Ref. ${e.code_original || "não informada"} · ${intervalInfo(e).label}${e.observation ? " · " + e.observation : ""}`;
      const companyProducts = products.filter((r) => r.code === e.code);
      const matches = companyProducts.filter(
        (r, index) =>
          companyProducts.findIndex((p) => p.product_id === r.product_id) ===
          index,
      );
      const recommendation: ManufacturerRecommendation = {
        id: e.id,
        name: e.description || "Peça sem descrição",
        code: e.code_original,
        variant: e.variant_name,
        interval: intervalInfo(e).label,
        interval_original: e.interval_original,
        interval_hours: e.interval_hours,
        observation: e.observation,
        issues: e.issues,
        itemKeys: [],
        products: companyProducts.map((r) => ({
          ...r,
          match_total: matches.length,
          current: balances.get(`${r.company_id}:${r.product_id}`),
        })),
      };
      recommendations.push(recommendation);
      if (!matches.length) {
        const unmatched = item(
          "material",
          "m:" + e.id,
          e.code_original,
          e.description || "Peça sem descrição",
          "",
          source + " · Sem vínculo M8; confirme unidade e preço.",
        );
        add(unmatched);
        recommendation.itemKeys.push(unmatched.key);
      }
      for (const r of matches) {
        const v = item(
          "material",
          `p:${c}:${r.product_id}:${(r.unit || "").trim().toUpperCase()}`,
          r.product_id,
          r.name || e.description,
          r.unit || "",
          source +
            " · Preço de referência: empresa 1" +
            (r.fields.includes("codigoM8")
              ? " · Código interno M8 indicado na lista"
              : r.genuine
                ? " · Referência fabricante (Genuína)"
                : " · Código de similaridade") +
            (r.blocked === "Sim" ? " · Bloqueado no M8" : ""),
        );
        if (sameUnit(r.unit, r.price_unit)) {
          v.referencePrice = numeric(r.sale_price);
          v.minimumPrice = numeric(r.minimum_price);
        }
        v.referenceAt = date(r.price_at);
        add(v);
        recommendation.itemKeys.push(v.key);
      }
    }
    if (!entries.length && (!manualSelection || filters.variant))
      warnings.push(
        "Nenhuma peça do fabricante encontrada para os filtros informados.",
      );
    warnings.push(
      "Vínculos por similaridade são alternativas: confira a aplicação e não selecione simultaneamente peças equivalentes sem necessidade.",
    );
  }
  for (const value of items.values()) {
    if (histories[value.key]) {
      const last = histories[value.key].rows[0]?.unitPrice || "";
      value.lastPrice = last === "" ? "" : String(Number(last));
    }
  }
  return {
    histories,
    items: await quoteProducts([...items.values()]),
    variants,
    intervals,
    warnings,
    recommendations,
  };
}
