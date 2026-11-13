"use client";
import { useEffect, useState } from "react";
import { itemFinancials } from "@/lib/crm/financials";
import { crmMoney } from "./crm-api";
import { Plus, RefreshCw } from "lucide-react";
import QuoteItemRow from "./quote-item-row";
import QuoteCatalogPicker from "./quote-catalog-picker";
import { mergeQuoteItems } from "@/lib/quotes/merge-items";
import {
  quoteItemIdentity,
  type QuoteItem,
  type QuoteSalesHistory,
} from "@/lib/quotes/types";
import type { OrderItem } from "@/lib/service-orders/model";
import { matchesSearch } from "@/lib/filters";

type History = {
  items: QuoteItem[];
  histories: Record<string, QuoteSalesHistory>;
  warnings: string[];
};
function savedItem(item: OrderItem, reference?: QuoteItem): QuoteItem {
  return {
    ...(reference || {
      key: `crm:${item.kind}:${item.code}`,
      kind: item.kind,
      code: item.code,
      name: item.name,
      unit: "",
      source: "Proposta comercial",
      referencePrice: "",
      minimumPrice: "",
      lastPrice: "",
      referenceAt: "",
    }),
    ...item.quote,
    kind: item.kind,
    code: item.code,
    name: item.name,
    quantity: item.quantity,
    price: item.price,
    selected: true,
  };
}
/** Reuses the quotation history engine, row editor and general catalog picker. */
export default function CrmProposalItems({
  active,
  kind,
  customer,
  equipment,
  company,
  items,
  onChange,
  disabled,
}: {
  active: boolean;
  kind: QuoteItem["kind"];
  customer: string;
  equipment: string;
  company: string;
  items: OrderItem[];
  onChange: (items: OrderItem[]) => void;
  disabled: boolean;
}) {
  const [history, setHistory] = useState<History>({
      items: [],
      histories: {},
      warnings: [],
    }),
    [working, setWorking] = useState<QuoteItem[]>([]),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [refresh, setRefresh] = useState(0),
    [search, setSearch] = useState(""),
    [catalog, setCatalog] = useState(false);
  useEffect(() => {
    setWorking([]);
    setSearch("");
  }, [customer, equipment]);
  useEffect(() => {
    if (!active || !customer) return;
    const c = new AbortController();
    setLoading(true);
    setError("");
    setHistory({ items: [], histories: {}, warnings: [] });
    fetch(
      "/api/quotes?" +
        new URLSearchParams({
          action: "history",
          clientId: customer,
          equipmentId: equipment,
          company,
          historyScope: "customer",
        }),
      { cache: "no-store", signal: c.signal },
    )
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok || !Array.isArray(body.items))
          throw Error(body.error || "Não foi possível consultar o histórico.");
        if (!c.signal.aborted)
          setHistory({
            items: body.items,
            histories: body.histories || {},
            warnings: body.warnings || [],
          });
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [active, customer, equipment, company, refresh]);
  const selected = items.map((item) =>
    savedItem(
      item,
      history.items.find((r) => r.kind === item.kind && r.code === item.code),
    ),
  );
  const drafts = [
    ...selected,
    ...working.filter(
      (w) =>
        !selected.some((s) => quoteItemIdentity(s) === quoteItemIdentity(w)),
    ),
  ];
  const merged = mergeQuoteItems(drafts, history.items, history.histories);
  const rows = [...merged.all.values()]
    .filter(
      (r) =>
        r.kind === kind &&
        matchesSearch(`${r.name} ${r.code} ${r.source}`, search),
    )
    .sort((a, b) => Number(b.selected) - Number(a.selected));
  function update(item: QuoteItem, patch: Partial<QuoteItem>) {
    if (disabled) return;
    const next = { ...item, ...patch },
      identity = quoteItemIdentity(next);
    setWorking((current) => [
      ...current.filter((r) => quoteItemIdentity(r) !== identity),
      next,
    ]);
    const old = items.find((r) => r.kind === next.kind && r.code === next.code);
    const remaining = items.filter((r) => r !== old);
    const { products, ...snapshot } = next;
    const updated = {
      ...old,
      kind: next.kind,
      code: next.code,
      name: next.name,
      quantity: next.quantity,
      price: next.price,
      quote: snapshot,
    };
    onChange(
      next.selected
        ? old
          ? items.map((r) => (r === old ? updated : r))
          : [...items, updated]
        : remaining,
    );
  }
  function add(item: QuoteItem) {
    if (items.some((r) => r.kind === item.kind && r.code === item.code)) return;
    update(item, { selected: true });
  }
  return (
    <section
      hidden={!active}
      className="crm-proposal-items"
      aria-label={
        kind === "material" ? "Produtos da proposta" : "Serviços da proposta"
      }
    >
      <header className="crm-heading">
        <div>
          <h2>{kind === "material" ? "Produtos" : "Serviços"} da proposta</h2>
          <p>
            {equipment
              ? "Histórico deste equipamento e cliente"
              : "Histórico do cliente"}{" "}
            · mesma consulta utilizada no Novo Orçamento.
          </p>
        </div>
        <div className="crm-actions">
          <button
            type="button"
            disabled={disabled || loading}
            onClick={() => setRefresh((n) => n + 1)}
          >
            <RefreshCw size={15} />
            Atualizar histórico
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setCatalog(true)}
          >
            <Plus size={15} />
            {kind === "material" ? "Adicionar Produto" : "Adicionar Serviço"}
          </button>
        </div>
      </header>
      <label>
        Filtrar {kind === "material" ? "produtos" : "serviços"}
        <input
          value={search}
          disabled={disabled}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Descrição, código ou origem"
        />
      </label>
      {loading && (
        <p role="status">Consultando histórico de produtos e serviços…</p>
      )}
      {error && (
        <p role="alert" className="crm-error">
          {error}
        </p>
      )}
      {history.warnings?.length > 0 && (
        <details>
          <summary>Informações do histórico</summary>
          {history.warnings.map((w, i) => (
            <p key={i}>{w}</p>
          ))}
        </details>
      )}
      <div className="quote-item-list">
        {rows.map((item) => {
          const saved = items.find(
            (r) => r.kind === item.kind && r.code === item.code,
          );
          return (
            <article className="crm-quote-item" key={quoteItemIdentity(item)}>
              <QuoteItemRow
                item={item}
                reference={merged.references.get(item.key)}
                history={merged.histories[item.key]}
                serial=""
                onChange={(patch) => update(item, patch)}
                onRemove={
                  item.selected
                    ? () => update(item, { selected: false })
                    : undefined
                }
              />
              {item.selected&&saved&&Number(saved.discountPercent)>0&&<p className="crm-discount-note">Desconto no resumo: {Number(saved.discountPercent).toLocaleString('pt-BR')}% · Total líquido: {crmMoney(itemFinancials(saved).sale)}</p>}
              {item.selected && saved && (
                <div
                  className="crm-item-financials"
                  aria-label={`Custos e margem: ${item.name}`}
                >
                  {kind === "material" ? (
                    <div>
                      <span>Custo médio unitário</span>
                      <strong>
                        {saved.unitCost
                          ? Number(saved.unitCost).toLocaleString("pt-BR", {
                              style: "currency",
                              currency: "BRL",
                              maximumFractionDigits: 6,
                            })
                          : "Não informado"}
                      </strong>
                    </div>
                  ) : (
                    <label>
                      Custo unitário (R$)
                      <input
                        aria-label={`Custo unitário: ${item.name}`}
                        type="number"
                        min="0"
                        max="99999999.99"
                        step="0.01"
                        placeholder="Não informado"
                        disabled={disabled}
                        value={saved.unitCost ?? ""}
                        onChange={(e) =>
                          onChange(
                            items.map((r) =>
                              r === saved
                                ? { ...r, unitCost: e.target.value }
                                : r,
                            ),
                          )
                        }
                      />
                    </label>
                  )}
                  <div>
                    <span>Custo total</span>
                    <strong>
                      {itemFinancials(saved).cost === null
                        ? "Não informado"
                        : crmMoney(itemFinancials(saved).cost!)}
                    </strong>
                  </div>
                  <div>
                    <span>Lucro bruto estimado</span>
                    <strong
                      className={
                        (itemFinancials(saved).profit ?? 0) < 0
                          ? "crm-negative"
                          : ""
                      }
                    >
                      {itemFinancials(saved).profit === null
                        ? "—"
                        : crmMoney(itemFinancials(saved).profit!)}
                    </strong>
                  </div>
                  <div>
                    <span>Margem bruta</span>
                    <strong>
                      {itemFinancials(saved).margin === null
                        ? "—"
                        : itemFinancials(saved).margin!.toLocaleString(
                            "pt-BR",
                            { maximumFractionDigits: 2 },
                          ) + "%"}
                    </strong>
                  </div>
                </div>
              )}
              {kind === "material" &&
                saved?.unitCostReason === "unit_mismatch" && (
                  <p className="crm-info">
                    O custo médio usa uma unidade diferente deste item. Confira
                    a unidade do produto; o custo não foi convertido
                    automaticamente.
                  </p>
                )}
              {kind === "service" && item.selected && (
                <div className="crm-form-grid">
                  <label>
                    Observação: {item.name}
                    <textarea
                      maxLength={20000}
                      value={saved?.notes || ""}
                      onChange={(e) =>
                        onChange(
                          items.map((r) =>
                            r === saved ? { ...r, notes: e.target.value } : r,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    Observação interna: {item.name}
                    <textarea
                      maxLength={20000}
                      value={saved?.internalNotes || ""}
                      onChange={(e) =>
                        onChange(
                          items.map((r) =>
                            r === saved
                              ? { ...r, internalNotes: e.target.value }
                              : r,
                          ),
                        )
                      }
                    />
                  </label>
                </div>
              )}
            </article>
          );
        })}
      </div>
      {!loading && !rows.length && (
        <p>
          Nenhum {kind === "material" ? "produto" : "serviço"} encontrado no
          histórico. Utilize Adicionar{" "}
          {kind === "material" ? "Produto" : "Serviço"} para consultar o
          cadastro geral.
        </p>
      )}
      {catalog && (
        <QuoteCatalogPicker
          kind={kind}
          historyContext={{ customer, equipment }}
          existing={new Set(selected.map(quoteItemIdentity))}
          onClose={() => setCatalog(false)}
          onAdd={add}
        />
      )}
    </section>
  );
}
