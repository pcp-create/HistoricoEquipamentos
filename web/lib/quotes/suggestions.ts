import "server-only";
import { createHash } from "node:crypto";
import { database } from "../db";
import { manufacturerCatalog, manualFilters } from "../manufacturer/catalog";
import { intervalInfo, matchesInterval } from "../manufacturer/intervals";
import { normalizeSerial } from "../manufacturer/rules";
import { sameUnit } from "../product-values";
import type { QuoteItem } from "./types";
import { QuoteValidation } from "./types";

const company = (p: URLSearchParams) => {
  const value = p.get("company") || "";
  if (!["1", "2", "27404"].includes(value))
    throw new QuoteValidation("Escolha uma empresa.");
  return value;
};
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
  const c = company(p),
    q = (p.get("q") || "").trim().slice(0, 120),
    db = database();
  const pattern = "%" + q.replace(/[\\%_]/g, "\\$&") + "%";
  if (p.get("lookup") === "clients") {
    if (q.length < 2) return { rows: [], truncated: false };
    const rows = (
      await db.query(
        `SELECT cliente_id::text AS id,max(cliente_nome) AS name,max(cliente_cpf_cnpj) AS document
    FROM m8_ordens_servico WHERE company_id=$1 AND cliente_id IS NOT NULL
    AND concat_ws(' ',cliente_nome,cliente_razao_social,cliente_cpf_cnpj,cliente_id) ILIKE $2
    GROUP BY cliente_id ORDER BY max(cliente_nome) LIMIT 31`,
        [c, pattern],
      )
    ).rows;
    return { rows: rows.slice(0, 30), truncated: rows.length > 30 };
  }
  if (p.get("lookup") === "equipment") {
    const id = p.get("clientId") || "";
    if (!/^\d{1,20}$/.test(id)) return { rows: [], truncated: false };
    const rows = (
      await db.query(
        `WITH equipment AS (
     SELECT COALESCE(NULLIF(e.equipamento_modelo,''),o.modelo_equipamento,'') AS model,
       COALESCE(NULLIF(e.numero_serie,''),NULLIF(o.numero_serie,''),o.serie,'') AS serial,
       COALESCE(NULLIF(o.equipamento,''),NULLIF(e.equipamento_modelo,''),o.modelo_equipamento,'Equipamento') AS name
     FROM m8_ordens_servico o LEFT JOIN m8_equipamentos e ON e.company_id=o.company_id AND e.ordem_servico_id=o.id_m8
     WHERE o.company_id=$1 AND o.cliente_id=$2
   ) SELECT DISTINCT model,serial,name FROM equipment ORDER BY name,model,serial LIMIT 301`,
        [c, id],
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
     WHERE s.company_id=$1 AND o.status='Processado' AND concat_ws(' ',s.servico_nome,s.servico_id) ILIKE $2
     ORDER BY COALESCE(s.servico_id::text,s.servico_nome),COALESCE(o.emissao,o.data_abertura) DESC NULLS LAST,s.id_m8 DESC LIMIT 101`,
        [c, pattern],
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
  result.source += ` · OS ${r.ordem_servico_id} · última quantidade: ${r.quantidade ?? "não informada"}`;
  return result;
}
export async function quoteSuggestions(p: URLSearchParams) {
  const c = company(p),
    clientId = p.get("clientId") || "",
    serial = normalizeSerial(p.get("serial") || "");
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
  if (/^\d{1,20}$/.test(clientId) && serial.length >= 4) {
    const orders = `SELECT o.id_m8,COALESCE(o.emissao,o.data_abertura) AS used_at FROM m8_ordens_servico o
    JOIN integracao_m8_os_sync sync ON sync.company_id=o.company_id AND sync.ordem_servico_id=o.id_m8
    WHERE o.company_id=$1 AND o.cliente_id=$2 AND o.status='Processado' AND sync.finalized IS TRUE AND sync.pending IS FALSE
    AND (regexp_replace(upper(COALESCE(o.numero_serie,'')),'[^A-Z0-9]','','g')=$3
     OR regexp_replace(upper(COALESCE(o.serie,'')),'[^A-Z0-9]','','g')=$3
     OR EXISTS(SELECT 1 FROM m8_equipamentos e WHERE e.company_id=o.company_id AND e.ordem_servico_id=o.id_m8 AND regexp_replace(upper(COALESCE(e.numero_serie,'')),'[^A-Z0-9]','','g')=$3))`;
    const materials = (
      await db.query(
        `WITH os AS (${orders})
    SELECT DISTINCT ON (COALESCE(p.produto_id::text,p.produto_nome),p.unidade_nome) p.*,os.used_at,
      c.sale_price,c.minimum_price,c.unit AS current_unit,c.price_at
    FROM os JOIN m8_os_produtos p ON p.ordem_servico_id=os.id_m8 AND p.company_id=$1
    LEFT JOIN m8_product_current c ON c.company_id=p.company_id AND c.product_id=p.produto_id
    WHERE p.esta_excluido IS NOT TRUE AND p.quantidade>0
    ORDER BY COALESCE(p.produto_id::text,p.produto_nome),p.unidade_nome,os.used_at DESC NULLS LAST,p.id_m8 DESC LIMIT 1001`,
        [c, clientId, serial],
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
        `Histórico · OS ${r.ordem_servico_id} · última quantidade: ${r.quantidade} · Ref.: ${r.referencia_fabricante || "—"}`,
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
    JOIN m8_os_servicos s ON s.ordem_servico_id=os.id_m8 AND s.company_id=$1
    ORDER BY COALESCE(s.servico_id::text,s.servico_nome),os.used_at DESC NULLS LAST,s.id_m8 DESC LIMIT 1001`,
        [c, clientId, serial],
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
      "Histórico restrito ao cliente e à série, em OS processadas com coleta concluída. Quantidades anteriores são referência, não consumo previsto. Se a OS contém várias máquinas, seus itens podem pertencer a outro equipamento da mesma OS.",
    );
  } else
    warnings.push(
      "Para sugerir pelo histórico, selecione um cliente da base e informe uma série com pelo menos quatro caracteres.",
    );
  let variants: any[] = [],
    intervals: any[] = [];
  if ((p.get("model") || "").trim()) {
    const manualParams = new URLSearchParams(p);
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
