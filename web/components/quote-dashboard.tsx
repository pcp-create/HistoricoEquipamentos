"use client";
import { useEffect, useId, useRef, useState } from "react";
import { ClipboardList, Plus, Save } from "lucide-react";
import SiteHeader from "./site-header";
import { compareQuoteItems } from "@/lib/quotes/presentation";
import QuoteItemRow from "./quote-item-row";
import QuoteCatalogPicker from "./quote-catalog-picker";
import { fold } from "@/lib/filters";
import {
  blankQuote,
  quoteItemIdentity,
  quoteTotals,
  type Quote,
  type QuoteItem,
  type ManufacturerRecommendation,
  type QuoteSalesHistory,
} from "@/lib/quotes/types";
type Draft = Quote & { number?: string };
type Summary = {
  id: string;
  number: string;
  client_name: string;
  equipment: string;
  total_cents: string;
  responsible?: string;
  pending_amounts?: boolean;
  updated_at: string;
  updated_by: string;
};
type Client = { id: string; name: string; document: string };
type Equipment = {
  equipment_id?: string;
  source?: string;
  serial_source?: string;
  name: string;
  model: string;
  serial: string;
};
type Suggestions = {
  histories?: Record<string, QuoteSalesHistory>;
  recommendations?: ManufacturerRecommendation[];
  items: QuoteItem[];
  warnings: string[];
  variants: { id: string; name: string; header: string[]; issues: string[] }[];
  intervals: { value: string; label: string; count: number }[];
};
const emptySuggestions = (): Suggestions => ({
  items: [],
  warnings: [],
  variants: [],
  intervals: [],
});
const money = (v: number | null) =>
  v === null
    ? "—"
    : new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
      }).format(v / 100);
async function api(url: string, options?: RequestInit) {
  const r = await fetch(url, options);
  if (r.status === 401) {
    window.location.assign("/login");
    throw new Error("Sessão expirada.");
  }
  const body = await r.json();
  if (!r.ok)
    throw new Error(body.error || "Não foi possível concluir a operação.");
  return body;
}
type LookupOption = { key: string; name: string; detail: string };
function QuoteLookup<T>({
  label,
  value,
  url,
  option,
  onSelect,
  onManual,
  placeholder,
}: {
  label: string;
  value: string;
  url: string;
  option: (row: T, index: number) => LookupOption;
  onSelect: (row: T) => void;
  onManual: (name: string) => void;
  placeholder: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [more, setMore] = useState(false);
  const [active, setActive] = useState(-1);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setRows([]);
    setMore(false);
    setError("");
    setLoading(true);
    setActive(-1);
    const timer = setTimeout(() => {
      api(url + "&q=" + encodeURIComponent(query), {
        signal: controller.signal,
      })
        .then((result) => {
          if (!controller.signal.aborted) {
            setRows(result.rows);
            setMore(result.truncated);
          }
        })
        .catch((e) => {
          if (!controller.signal.aborted) setError(e.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, query, url]);
  const manual = query.trim();
  const count = rows.length + (manual ? 1 : 0);
  function select(index: number) {
    if (index < rows.length) onSelect(rows[index]);
    else if (manual) onManual(manual);
    setOpen(false);
  }
  function show() {
    if (!open) {
      setQuery("");
      setRows([]);
      setLoading(true);
      setActive(-1);
      setOpen(true);
    }
  }
  return (
    <div
      className="manual-global quote-lookup"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null))
          setOpen(false);
      }}
    >
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={id + "-list"}
        aria-activedescendant={
          open && active >= 0 ? id + "-" + active : undefined
        }
        autoComplete="off"
        maxLength={500}
        value={open ? query : value}
        placeholder={open ? placeholder : value || placeholder}
        onFocus={show}
        onClick={show}
        onChange={(e) => {
          setQuery(e.target.value);
          setRows([]);
          setActive(-1);
          setLoading(true);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            setOpen(false);
          }
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            if (!open) show();
            else if (count) {
              const next =
                e.key === "ArrowDown"
                  ? (active + 1) % count
                  : active <= 0
                    ? count - 1
                    : active - 1;
              setActive(next);
              document
                .getElementById(id + "-" + next)
                ?.scrollIntoView({ block: "nearest" });
            }
          }
          if (e.key === "Enter" && open) {
            e.preventDefault();
            if (active >= 0) select(active);
          }
        }}
      />
      {open && (
        <div className="quote-lookup-menu">
          <div
            id={id + "-list"}
            role="listbox"
            aria-label={label}
            aria-busy={loading}
          >
            {rows.map((row, index) => {
              const item = option(row, index);
              return (
                <button
                  type="button"
                  role="option"
                  id={id + "-" + index}
                  key={item.key}
                  aria-selected={active === index}
                  tabIndex={-1}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => select(index)}
                >
                  <strong>{item.name}</strong>
                  <small>{item.detail}</small>
                </button>
              );
            })}
            {manual && (
              <button
                type="button"
                role="option"
                id={id + "-" + rows.length}
                aria-selected={active === rows.length}
                tabIndex={-1}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => select(rows.length)}
              >
                Usar “{manual}” como nome manual
              </button>
            )}
          </div>
          <small role="status">
            {loading
              ? "Buscando…"
              : error ||
                (more
                  ? "Digite mais detalhes para encontrar outros resultados."
                  : !rows.length
                    ? "Nenhum cadastro encontrado."
                    : `${rows.length} resultado(s)`)}
          </small>
        </div>
      )}
    </div>
  );
}
export default function QuoteDashboard() {
  const [draftSearch, setDraftSearch] = useState("");
  const [quote, setQuote] = useState<Draft>(blankQuote),
    [drafts, setDrafts] = useState<Summary[]>([]),
    [email, setEmail] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestions>(emptySuggestions),
    [busy, setBusy] = useState(false),
    [saving, setSaving] = useState(false);
  const [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [dirty, setDirty] = useState(false);
  const [filter, setFilter] = useState("");
  const [extraFilter, setExtraFilter] = useState("");
  const [pickerKind, setPickerKind] = useState<QuoteItem["kind"] | null>(null);
  const [kind, setKind] = useState("all");
  const [extrasOpen, setExtrasOpen] = useState(false);
  const suggestionRequest = useRef<AbortController | null>(null);
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;

  async function refreshList() {
    const body = await api(
      "/api/quotes?" + new URLSearchParams({ q: draftSearch }),
    );
    setDrafts(body.rows);
    setEmail(body.email);
  }
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api("/api/quotes?" + new URLSearchParams({ q: draftSearch }), {
        signal: controller.signal,
      })
        .then((body) => {
          setDrafts(body.rows);
          setEmail(body.email);
        })
        .catch((e) => {
          if (e.name !== "AbortError") setError(e.message);
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [draftSearch]);
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => {
      window.removeEventListener("beforeunload", handler);
      suggestionRequest.current?.abort();
    };
  }, []);
  function change(patch: Partial<Draft>) {
    setQuote((q) => ({ ...q, ...patch }));
    setDirty(true);
    setMessage("");
  }
  function invalidateSuggestions() {
    setExtrasOpen(false);
    suggestionRequest.current?.abort();
    setBusy(false);
    setSuggestions(emptySuggestions());
    setExtraFilter("");
    setPickerKind(null);
  }
  function context(patch: Partial<Draft>) {
    if (
      quote.items.length &&
      !window.confirm(
        "Alterar cliente ou equipamento remove os itens deste rascunho. Continuar?",
      )
    )
      return null;
    invalidateSuggestions();
    setExtrasOpen(false);
    const next = {
      ...quote,
      equipmentId:
        Object.keys(patch).length === 1 && "model" in patch
          ? quote.equipmentId
          : "",
      ...patch,
      items: [],
      variant: "",
      interval: "",
    };
    setQuote(next);
    setDirty(true);
    setMessage("");
    return next;
  }
  async function loadSuggestions(target = quote) {
    suggestionRequest.current?.abort();
    const controller = new AbortController();
    suggestionRequest.current = controller;
    setBusy(true);
    setSuggestions((s) => ({ ...s, recommendations: [] }));
    setError("");
    const params = new URLSearchParams({
      action: "suggestions",
      company: target.company,
      clientId: target.clientId,
      equipmentId: target.equipmentId || "",
      model: target.model,
      serial: target.serial,
      variant: target.variant,
      interval: target.interval,
    });
    try {
      setSuggestions(
        await api("/api/quotes?" + params, { signal: controller.signal }),
      );
    } catch (e) {
      if (!controller.signal.aborted) setError((e as Error).message);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  function isDuplicate(item: QuoteItem) {
    return quote.items.some(
      (i) =>
        i.selected &&
        i.key !== item.key &&
        quoteItemIdentity(i) === quoteItemIdentity(item),
    );
  }
  function updateItem(item: QuoteItem, patch: Partial<QuoteItem>) {
    if (patch.selected && isDuplicate(item)) {
      setMessage("Este item já está selecionado em outra linha.");
      return;
    }
    setQuote((q) => ({
      ...q,
      items: q.items.some((i) => i.key === item.key)
        ? q.items.map((i) => (i.key === item.key ? { ...i, ...patch } : i))
        : [...q.items, { ...item, ...patch }],
    }));
    setDirty(true);
    setMessage("");
  }
  function addFromCatalog(item: QuoteItem) {
    if (
      [...quote.items, ...suggestions.items].some(
        (i) => quoteItemIdentity(i) === quoteItemIdentity(item),
      )
    ) {
      setMessage("Este item já está na lista. Utilize a linha existente.");
      return;
    }
    updateItem(item, { selected: true });
    setExtrasOpen(true);
    setKind("all");
    setFilter("");
    setExtraFilter("");
  }
  async function save() {
    setSaving(true);
    setError("");
    setMessage("");
    const snapshot = quote;
    try {
      const saved = await api("/api/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(snapshot),
      });
      setQuote({
        ...saved,
        items: saved.items.map((item: QuoteItem) => ({
          ...item,
          products: snapshot.items.find((i) => i.key === item.key)?.products,
        })),
      });
      setDirty(false);
      setMessage("Rascunho salvo.");
      await refreshList();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  async function open(id: string) {
    if (
      dirty &&
      !window.confirm(
        "Há alterações não salvas. Abrir outro orçamento e descartá-las?",
      )
    )
      return;
    setError("");
    setSaving(true);
    try {
      const saved = await api("/api/quotes?id=" + encodeURIComponent(id));
      invalidateSuggestions();
      setQuote(saved);
      setDirty(false);
      loadSuggestions(saved);
      setMessage("");
      setFilter("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  function newDraft() {
    if (
      dirty &&
      !window.confirm(
        "Descartar alterações não salvas e iniciar um novo orçamento?",
      )
    )
      return;
    invalidateSuggestions();
    setQuote(blankQuote());
    setDirty(false);
    setError("");
    setMessage("");
    setFilter("");
  }
  const all = new Map(suggestions.items.map((i) => [i.key, i]));
  quote.items.forEach((i) => all.set(i.key, i));
  const showManufacturer = !!quote.interval;
  const recommendations = suggestions.recommendations || [];
  const recommendationKeys = new Set(
    recommendations.flatMap((r) => r.itemKeys),
  );
  const recommendedRows = recommendations.filter((r) =>
    [
      r.name,
      r.code,
      r.variant,
      ...r.products.map(
        (p) =>
          `${p.name} ${p.product_id} ${p.reference || ""} ${p.similarity || ""}`,
      ),
    ]
      .join(" ")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .includes(fold(filter)),
  );
  const rows = [...all.values()].filter(
    (i) =>
      (!showManufacturer || !recommendationKeys.has(i.key)) &&
      (kind === "all" || i.kind === kind) &&
      fold([i.name, i.code].join(" ")).includes(fold(extraFilter).trim()),
  );
  rows.sort((a, b) =>
    compareQuoteItems(
      a,
      b,
      suggestions.histories,
      recommendations.flatMap((r) => r.products),
    ),
  );
  const totals = quoteTotals(quote.items);
  return (
    <>
      <SiteHeader active="quotes" email={email} />
      {pickerKind && (
        <QuoteCatalogPicker
          kind={pickerKind}
          existing={new Set([...all.values()].map(quoteItemIdentity))}
          onAdd={addFromCatalog}
          onClose={() => setPickerKind(null)}
        />
      )}
      <main className="manual-page quotes-page">
        <div className="manual-title">
          <ClipboardList size={30} />
          <div>
            <h1>Orçamentos</h1>
            <p>
              Monte uma proposta com o histórico do equipamento e as referências
              do fabricante.
            </p>
          </div>
        </div>
        <div className="quote-workspace">
          <aside className="manual-card quote-list">
            <button
              className="primary-button"
              onClick={newDraft}
              disabled={saving}
            >
              <Plus size={16} /> Novo orçamento
            </button>
            <h2>Rascunhos da equipe</h2>
            <label className="quote-draft-search">
              Buscar rascunhos
              <input
                value={draftSearch}
                onChange={(e) => setDraftSearch(e.target.value)}
                placeholder="Número, cliente ou equipamento"
              />
            </label>
            <small>Até 100 resultados · mais recentes primeiro</small>
            {drafts.length === 0 && <p>Nenhum rascunho salvo.</p>}
            {drafts.map((d) => (
              <button
                className={
                  "quote-draft " +
                  (quote.id === d.id ? "quote-draft-active" : "")
                }
                key={d.id}
                onClick={() => open(d.id)}
                disabled={saving}
              >
                <strong>ORÇ-{d.number.padStart(5, "0")}</strong>
                <span>{d.client_name || "Cliente a definir"}</span>
                <small>{d.equipment || "Equipamento a definir"}</small>
                {d.responsible && <small>Responsável: {d.responsible}</small>}
                <span>
                  {d.pending_amounts
                    ? "Valores pendentes"
                    : money(Number(d.total_cents))}
                </span>
              </button>
            ))}
          </aside>
          <div className="quote-editor">
            {error && (
              <div className="error" role="alert">
                {error}
              </div>
            )}
            {message && (
              <p role="status" className="quote-message">
                {message}
              </p>
            )}
            <fieldset disabled={saving} className="quote-fieldset">
              <section className="manual-card">
                <div className="quote-section-title">
                  <h2>
                    {quote.number
                      ? "ORÇ-" + quote.number.padStart(5, "0")
                      : "Novo orçamento"}{" "}
                    <span className="count-pill">Rascunho interno</span>
                  </h2>
                  <small>
                    {dirty
                      ? "Alterações não salvas"
                      : quote.id
                        ? "Salvo"
                        : "Preencha os dados para começar"}
                  </small>
                </div>
                <div className="manual-filters quote-fields">
                  <label className="manual-global">
                    Responsável pelo orçamento
                    <input
                      maxLength={200}
                      value={quote.responsible || ""}
                      onChange={(e) => change({ responsible: e.target.value })}
                      placeholder="Nome do responsável"
                    />
                  </label>
                  <QuoteLookup<Client>
                    key={
                      "client-" +
                      (quote.id || "new") +
                      "-" +
                      quote.clientId +
                      "-" +
                      quote.client
                    }
                    label="Cliente"
                    value={quote.client}
                    url="/api/quotes?lookup=clients"
                    placeholder="Selecione ou digite nome, documento ou código"
                    option={(c) => ({
                      key: c.id,
                      name: c.name,
                      detail: c.document || c.id,
                    })}
                    onSelect={(c) => {
                      if (c.id === quote.clientId) return;
                      context({
                        clientId: c.id,
                        client: c.name,
                        equipment: "",
                        model: "",
                        serial: "",
                      });
                    }}
                    onManual={(client) =>
                      context({
                        client,
                        clientId: "",
                        equipment: "",
                        model: "",
                        serial: "",
                      })
                    }
                  />
                  <QuoteLookup<Equipment>
                    key={
                      "equipment-" +
                      (quote.id || "new") +
                      "-" +
                      quote.clientId +
                      "-" +
                      quote.equipment +
                      "-" +
                      quote.serial
                    }
                    label="Equipamento"
                    value={quote.equipment}
                    url={
                      "/api/quotes?lookup=equipment&clientId=" +
                      encodeURIComponent(quote.clientId)
                    }
                    placeholder="Selecione ou digite equipamento, modelo ou série"
                    option={(eq, i) => ({
                      key: String(i),
                      name: eq.name,
                      detail: [
                        eq.model || "Sem modelo",
                        eq.serial || "Sem série",
                        eq.source,
                      ]
                        .filter(Boolean)
                        .join(" · "),
                    })}
                    onSelect={(eq) => {
                      if (
                        eq.name === quote.equipment &&
                        eq.serial === quote.serial &&
                        eq.model === quote.model &&
                        (eq.equipment_id || "") === (quote.equipmentId || "")
                      )
                        return;
                      const next = context({
                        equipment: eq.name,
                        equipmentId: eq.equipment_id || "",
                        model: eq.model,
                        serial: eq.serial,
                      });
                      if (next) loadSuggestions(next);
                    }}
                    onManual={(equipment) =>
                      context({ equipment, model: "", serial: "" })
                    }
                  />
                  <label>
                    Modelo
                    <input
                      maxLength={80}
                      value={quote.model}
                      onChange={(e) => context({ model: e.target.value })}
                      placeholder="Ex.: GA 15"
                    />
                  </label>
                  <label>
                    Número de série
                    <input
                      maxLength={60}
                      value={quote.serial}
                      onChange={(e) => context({ serial: e.target.value })}
                    />
                  </label>
                  <label className="manual-global">
                    Tipo de manutenção
                    <input
                      maxLength={200}
                      list="maintenance-types"
                      value={quote.serviceType}
                      onChange={(e) => change({ serviceType: e.target.value })}
                      placeholder="Selecione ou descreva o serviço"
                    />
                    <datalist id="maintenance-types">
                      <option>Manutenção preventiva</option>
                      <option>Manutenção corretiva</option>
                      <option>Revisão geral</option>
                      <option>Inspeção técnica</option>
                    </datalist>
                  </label>
                </div>
                <div className="quote-toolbar">
                  <button
                    className="primary-button"
                    onClick={() => loadSuggestions()}
                    disabled={busy}
                  >
                    {busy
                      ? "Buscando sugestões…"
                      : "Buscar histórico e fabricante"}
                  </button>
                  <small>
                    O histórico reúne as empresas 1, 2 e 27404. A seleção do
                    equipamento já inicia a busca. Para dados manuais, use este
                    botão.
                  </small>
                </div>
                {!quote.model &&
                  !quote.serial &&
                  suggestions.variants.length > 0 && (
                    <p className="muted">
                      Modelo e série não informados. Escolha uma versão do
                      fabricante na lista completa abaixo. Essa seleção orienta
                      as peças, mas não identifica o histórico de uma máquina.
                    </p>
                  )}
                <div className="manual-filters quote-fields">
                  <label className="manual-global">
                    Versão do fabricante
                    <select
                      value={quote.variant}
                      onChange={(e) => {
                        change({ variant: e.target.value, interval: "" });
                        loadSuggestions({
                          ...quote,
                          variant: e.target.value,
                          interval: "",
                        });
                      }}
                    >
                      <option value="">
                        {!quote.model && !quote.serial
                          ? "Selecione a versão do fabricante…"
                          : "Todas as versões candidatas"}
                      </option>
                      {suggestions.variants.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Intervalo da revisão
                    <select
                      value={quote.interval}
                      onChange={(e) => {
                        setExtrasOpen(false);
                        change({ interval: e.target.value });
                        loadSuggestions({ ...quote, interval: e.target.value });
                      }}
                    >
                      <option value="">Todos os intervalos</option>
                      {suggestions.intervals.map((i) => (
                        <option key={i.value} value={i.value}>
                          {i.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {quote.interval.startsWith("h:") && (
                  <p className="muted">
                    Inclui os intervalos menores que se repetem nesta revisão.
                  </p>
                )}
                {quote.items.length > 0 && (
                  <p className="muted">
                    Atualizar as sugestões não altera os itens já incluídos.
                    Revise a seleção ao mudar a versão ou o intervalo.
                  </p>
                )}
                {suggestions.warnings.length > 0 && (
                  <details className="quote-guidance">
                    <summary>
                      Conferir as sugestões ({suggestions.warnings.length})
                    </summary>
                    {suggestions.warnings.map((w, i) => (
                      <p key={i}>{w}</p>
                    ))}
                  </details>
                )}
                {suggestions.variants
                  .filter((v) => !quote.variant || quote.variant === v.id)
                  .map((v) => (
                    <details className="quote-guidance" key={v.id}>
                      <summary>Condições: {v.name}</summary>
                      <p>{v.header.join(" · ")}</p>
                      {v.issues.map((issue, i) => (
                        <p key={i}>{issue}</p>
                      ))}
                    </details>
                  ))}
              </section>
              <section className="manual-card quote-items">
                <div className="quote-section-title">
                  <div>
                    <h2>
                      {showManufacturer
                        ? "Peças para esta revisão"
                        : "Materiais e serviços"}
                    </h2>
                    <p className="muted">
                      {showManufacturer
                        ? "Recomendações do fabricante, incluindo os intervalos menores que se repetem. Escolha a opção genuína ou similar."
                        : "Selecione os itens e ajuste quantidade e preço na mesma linha."}
                    </p>
                  </div>
                  <span className="count-pill">
                    {quote.items.filter((i) => i.selected).length} selecionados
                  </span>
                </div>
                {showManufacturer && (
                  <label className="quote-material-search">
                    Filtrar recomendações
                    <input
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                      placeholder="Descrição, código interno ou referência"
                    />
                  </label>
                )}
                {showManufacturer && (
                  <div className="quote-revision-list" aria-busy={busy}>
                    {busy ? (
                      <p role="status">Atualizando as peças desta revisão…</p>
                    ) : (
                      <>
                        {!recommendedRows.length && (
                          <p>
                            Nenhuma recomendação encontrada. Confira modelo,
                            série e versão, ou consulte os demais itens abaixo.
                          </p>
                        )}
                        {recommendedRows.map((r) => (
                          <article className="quote-revision-group" key={r.id}>
                            <header>
                              <div>
                                <h3>{r.name}</h3>
                                <small>
                                  Referência fabricante (Genuína):{" "}
                                  <b>{r.code || "Não informada"}</b>
                                </small>
                              </div>
                              <small>{r.interval}</small>
                            </header>
                            <small className="quote-revision-version">
                              {r.variant}
                            </small>
                            {(r.observation || r.issues.length > 0) && (
                              <details className="quote-application">
                                <summary>Condições de aplicação</summary>
                                <p>{r.observation}</p>
                                {r.issues.map((issue, n) => (
                                  <p key={n}>{issue}</p>
                                ))}
                              </details>
                            )}
                            {!r.products.length && (
                              <p className="muted">
                                Sem correspondência no M8. Informe unidade e
                                preço para incluir.
                              </p>
                            )}
                            {[...r.itemKeys]
                              .sort((a, b) =>
                                all.has(a) && all.has(b)
                                  ? compareQuoteItems(
                                      all.get(a)!,
                                      all.get(b)!,
                                      suggestions.histories,
                                      r.products,
                                    )
                                  : 0,
                              )
                              .map((key) => {
                                const i = all.get(key);
                                return (
                                  i && (
                                    <QuoteItemRow
                                      key={key}
                                      item={i}
                                      duplicate={isDuplicate(i)}
                                      reference={suggestions.items.find(
                                        (item) => item.key === key,
                                      )}
                                      history={suggestions.histories?.[key]}
                                      products={r.products.filter(
                                        (product) =>
                                          product.product_id === i.code,
                                      )}
                                      serial={quote.serial}
                                      onChange={(patch) => updateItem(i, patch)}
                                    />
                                  )
                                );
                              })}
                          </article>
                        ))}
                      </>
                    )}
                  </div>
                )}
                <details
                  className="quote-extras"
                  open={!showManufacturer || extrasOpen}
                  onToggle={(e) => {
                    if (showManufacturer) setExtrasOpen(e.currentTarget.open);
                  }}
                >
                  <summary>
                    {showManufacturer
                      ? "Outros materiais e serviços"
                      : "Itens disponíveis"}
                    <span>
                      {rows.length} na lista ·{" "}
                      {
                        quote.items.filter(
                          (i) =>
                            i.selected &&
                            (!showManufacturer ||
                              !recommendationKeys.has(i.key)),
                        ).length
                      }{" "}
                      selecionados
                    </span>
                  </summary>
                  <p className="muted">
                    Histórico do cliente/equipamento e itens adicionados do
                    cadastro geral. Os selecionados continuam no total mesmo com
                    esta lista recolhida.
                  </p>
                  <div className="quote-toolbar">
                    <label className="quote-extra-filter">
                      Filtrar materiais e serviços
                      <input
                        value={extraFilter}
                        onChange={(e) => setExtraFilter(e.target.value)}
                        placeholder="Digite descrição ou código"
                      />
                    </label>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => setPickerKind("material")}
                    >
                      <Plus size={16} /> Adicionar material
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => setPickerKind("service")}
                    >
                      <Plus size={16} /> Adicionar serviço
                    </button>
                    <label>
                      Tipo de item
                      <select
                        value={kind}
                        onChange={(e) => setKind(e.target.value)}
                      >
                        <option value="all">Todos</option>
                        <option value="material">Materiais</option>
                        <option value="service">Serviços</option>
                      </select>
                    </label>
                  </div>
                  {!rows.length && (
                    <p className="quote-empty">
                      Nenhum item corresponde ao filtro. Use Adicionar material
                      ou Adicionar serviço para consultar a base geral.
                    </p>
                  )}
                  <div className="quote-item-list">
                    {rows.map((i) => (
                      <QuoteItemRow
                        key={i.key}
                        item={i}
                        duplicate={isDuplicate(i)}
                        reference={suggestions.items.find(
                          (item) => item.key === i.key,
                        )}
                        history={suggestions.histories?.[i.key]}
                        serial={quote.serial}
                        onChange={(patch) => updateItem(i, patch)}
                        onRemove={
                          i.key.startsWith("manual:")
                            ? () =>
                                change({
                                  items: quote.items.filter(
                                    (x) => x.key !== i.key,
                                  ),
                                })
                            : undefined
                        }
                      />
                    ))}
                  </div>
                </details>
              </section>
              <section className="manual-card quote-bottom">
                <label>
                  Observações do orçamento
                  <textarea
                    maxLength={5000}
                    rows={4}
                    value={quote.notes}
                    onChange={(e) => change({ notes: e.target.value })}
                    placeholder="Escopo, condições e observações para a equipe"
                  />
                </label>
                <div className="quote-total" aria-label="Total do orçamento">
                  <div>
                    <span>Materiais Aplicados</span>
                    <strong>{money(totals.materials)}</strong>
                  </div>
                  <div>
                    <span>Serviços Aplicados</span>
                    <strong>{money(totals.services)}</strong>
                  </div>
                  <div>
                    <span>Valor Total do Orçamento</span>
                    <strong>
                      {totals.invalid ? "Pendente" : money(totals.total)}
                    </strong>
                  </div>
                  {totals.invalid > 0 && (
                    <p className="quote-warning">
                      {totals.invalid} item(ns) selecionado(s) sem quantidade ou
                      preço válido.
                    </p>
                  )}
                  <button
                    className="primary-button"
                    disabled={saving}
                    onClick={save}
                  >
                    <Save size={17} />
                    {saving ? "Salvando…" : "Salvar rascunho"}
                  </button>
                  <small>
                    Você pode salvar com campos e valores pendentes e continuar
                    depois. Não há envio ao M8 nem reserva de estoque.
                  </small>
                </div>
              </section>
            </fieldset>
          </div>
        </div>
      </main>
    </>
  );
}
