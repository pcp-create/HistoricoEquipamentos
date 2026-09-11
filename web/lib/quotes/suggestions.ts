import "server-only";
import { createHash } from "node:crypto";
import { database } from "../db";
import { manufacturerCatalog, manualFilters } from "../manufacturer/catalog";
import { intervalInfo, matchesInterval } from "../manufacturer/intervals";
import { normalizeSerial } from "../manufacturer/rules";
import { sameUnit } from "../product-values";
import type { QuoteItem } from "./types";
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
export async function quoteLookup(p: URLSearchParams) {
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
 SELECT ''::text AS equipment_id,COALESCE(NULLIF(o.equipamento,''),NULLIF(e.equipamento_modelo,''),o.modelo_equipamento,'Equipamento') AS name,
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
  if (p.get("lookup") === "services") {
    if (q.length < 2) return { items: [], truncated: false };
    const rows = (
      await db.query(
        `SELECT DISTINCT ON (COALESCE(s.servico_id::text,s.servico_nome)) s.*,COALESCE(o.emissao,o.data_abertura) AS used_at
     FROM m8_os_servicos s JOIN m8_ordens_servico o ON o.company_id=s.company_id AND o.id_m8=s.ordem_servico_id
     WHERE s.company_id IN(1,2,27404) AND o.status='Processado' AND concat_ws(' ',s.servico_nome,s.servico_id) ILIKE $1
     ORDER BY COALESCE(s.servico_id::text,s.servico_nome),COALESCE(o.emissao,o.data_abertura) DESC NULLS LAST,s.id_m8 DESC LIMIT 101`,
        [pattern],
      )
    ).rows;
    return {
      items: rows
        .slice(0, 100)
        .map((r) =>
          serviceItem(r, c, "Base de serviços · última OS processada"),
        ),
      truncated: rows.length > 100,
    };
  }
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
    serial = normalizeSerial(p.get("serial") || ""),
    equipmentId = p.get("equipmentId") || "";
  if (equipmentId && !/^\d{1,18}$/.test(equipmentId))
    throw new QuoteValidation("Equipamento inválido.");
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
  if (/^\d{1,20}$/.test(clientId) && (serial.length >= 4 || equipmentId)) {
    const orders = `SELECT o.company_id,o.id_m8,COALESCE(o.emissao,o.data_abertura) AS used_at FROM m8_ordens_servico o
    JOIN integracao_m8_os_sync sync ON sync.company_id=o.company_id AND sync.ordem_servico_id=o.id_m8
    WHERE o.company_id IN(1,2,27404) AND o.cliente_id=$1 AND o.status='Processado' AND sync.finalized IS TRUE AND sync.pending IS FALSE
    AND (($3='' AND $2<>'' AND (regexp_replace(upper(COALESCE(o.numero_serie,'')),'[^A-Z0-9]','','g')=$2
     OR regexp_replace(upper(COALESCE(o.serie,'')),'[^A-Z0-9]','','g')=$2
     OR EXISTS(SELECT 1 FROM m8_equipamentos e WHERE e.company_id=o.company_id AND e.ordem_servico_id=o.id_m8 AND regexp_replace(upper(COALESCE(e.numero_serie,'')),'[^A-Z0-9]','','g')=$2))) OR EXISTS(SELECT 1 FROM m8_equipment_linked l WHERE l.company_id=o.company_id AND l.order_id=o.id_m8 AND (($3<>'' AND l.equipment_id::text=$3) OR ($3='' AND $2<>'' AND l.serial=$2))))`;
    const materials = (
      await db.query(
        `WITH os AS (${orders})
    SELECT DISTINCT ON (COALESCE(p.produto_id::text,p.produto_nome),p.unidade_nome) p.*,os.used_at,
      c.sale_price,c.minimum_price,c.unit AS current_unit,c.price_at
    FROM os JOIN m8_os_produtos p ON p.ordem_servico_id=os.id_m8 AND p.company_id=os.company_id
    LEFT JOIN m8_product_current c ON c.company_id=1 AND c.product_id=p.produto_id
    WHERE p.esta_excluido IS NOT TRUE AND p.quantidade>0
    ORDER BY COALESCE(p.produto_id::text,p.produto_nome),p.unidade_nome,os.used_at DESC NULLS LAST,p.id_m8 DESC LIMIT 1001`,
        [clientId, serial, equipmentId],
      )
    ).rows;
    for (const r of materials.slice(0, 1000)) {
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
    ORDER BY COALESCE(s.servico_id::text,s.servico_nome),os.used_at DESC NULLS LAST,s.id_m8 DESC LIMIT 1001`,
        [clientId, serial, equipmentId],
      )
    ).rows;
    services
      .slice(0, 1000)
      .forEach((r) => add(serviceItem(r, c, "Histórico do equipamento")));
    if (materials.length > 1000 || services.length > 1000)
      warnings.push(
        "Histórico muito extenso: exibindo até 1.000 materiais e 1.000 serviços distintos.",
      );
    warnings.push(
      "Histórico das empresas 1, 2 e 27404, restrito ao cliente e ao equipamento ou à série, em OS processadas com coleta concluída. Quantidades anteriores são referência, não consumo previsto. Se a OS contém várias máquinas, seus itens podem pertencer a outro equipamento da mesma OS.",
    );
  } else
    warnings.push(
      "Para sugerir pelo histórico, selecione um cliente e um equipamento cadastrado, ou informe uma série com pelo menos quatro caracteres.",
    );
  let variants: any[] = [],
    intervals: any[] = [];
  if ((p.get("model") || "").trim()) {
    const manualParams = new URLSearchParams(p);
    manualParams.set("company", "1");
    if (serial.length < 4) manualParams.set("serial", "");
    const filters = manualFilters(manualParams);
    // A short/unavailable serial does not establish manufacturer applicability.
    const metadata = await manufacturerCatalog(
      { ...filters, serial: serial.length >= 4 ? filters.serial : "" },
      true,
    );
    variants = metadata.variants;
    intervals = metadata.intervals;
    const selected = filters.variant
      ? variants.filter((v) => v.id === filters.variant)
      : variants;
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
        `SELECT x.code,c.product_id::text,c.name,c.unit,c.payload->>'bloqueado' AS blocked,
     bool_or(x.field='referenciaFabricante') AS genuine,max(p.sale_price) AS sale_price,max(p.minimum_price) AS minimum_price,max(p.price_at) AS price_at
     FROM manufacturer_product_codes x JOIN m8_product_catalog c ON c.company_id=x.company_id AND c.product_id=x.product_id
     LEFT JOIN m8_product_current p ON p.company_id=c.company_id AND p.product_id=c.product_id
     WHERE x.company_id=$1 AND x.code=ANY($2::text[])
     GROUP BY x.code,c.product_id,c.name,c.unit,c.payload ORDER BY bool_or(x.field='referenciaFabricante') DESC,c.product_id`,
        [c, codes],
      )
    ).rows;
    for (const e of entries) {
      const source = `Fabricante · ${e.variant_name} · linha ${e.row_number} · Ref. ${e.code_original || "não informada"} · ${intervalInfo(e).label}${e.observation ? " · " + e.observation : ""}`;
      const matches = products.filter((r) => r.code === e.code);
      if (!matches.length)
        add(
          item(
            "material",
            "m:" + e.id,
            e.code_original,
            e.description || "Peça sem descrição",
            "",
            source + " · Sem vínculo M8; confirme unidade e preço.",
          ),
        );
      for (const r of matches) {
        const v = item(
          "material",
          `p:${c}:${r.product_id}:${(r.unit || "").trim().toUpperCase()}`,
          r.product_id,
          r.name || e.description,
          r.unit || "",
          source +
            " · Preço de referência: empresa 1" +
            (r.genuine
              ? " · Referência fabricante (Genuína)"
              : " · Código de similaridade") +
            (r.blocked === "Sim" ? " · Bloqueado no M8" : ""),
        );
        v.referencePrice = numeric(r.sale_price);
        v.minimumPrice = numeric(r.minimum_price);
        v.referenceAt = date(r.price_at);
        add(v);
      }
    }
    if (!entries.length)
      warnings.push(
        "Nenhuma peça do fabricante encontrada para os filtros informados.",
      );
    warnings.push(
      "Vínculos por similaridade são alternativas: confira a aplicação e não selecione simultaneamente peças equivalentes sem necessidade.",
    );
  } else
    warnings.push("Informe o modelo para consultar as peças do fabricante.");
  return { items: [...items.values()], variants, intervals, warnings };
}
