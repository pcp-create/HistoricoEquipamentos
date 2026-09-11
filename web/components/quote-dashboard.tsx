"use client";
import { useEffect, useId, useRef, useState } from "react";
import { ClipboardList, Plus, Save, Search, Trash2 } from "lucide-react";
import SiteHeader from "./site-header";
import {
  blankQuote,
  lineAmount,
  quoteTotals,
  type Quote,
  type QuoteItem,
} from "@/lib/quotes/types";
type Draft = Quote & { number?: string };
type Summary = {
  id: string;
  number: string;
  client_name: string;
  equipment: string;
  total_cents: string;
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
const reference = (v: string) =>
  v !== "" && Number.isFinite(Number(v))
    ? money(Math.round(Number(v) * 100))
    : "—";
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
  const [serviceSearch, setServiceSearch] = useState(""),
    [serviceBusy, setServiceBusy] = useState(false),
    [filter, setFilter] = useState("");
  const [kind, setKind] = useState("all");
  const suggestionRequest = useRef<AbortController | null>(null);
  const serviceRequest = useRef<AbortController | null>(null);
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
      serviceRequest.current?.abort();
    };
  }, []);
  function change(patch: Partial<Draft>) {
    setQuote((q) => ({ ...q, ...patch }));
    setDirty(true);
    setMessage("");
  }
  function invalidateSuggestions() {
    suggestionRequest.current?.abort();
    serviceRequest.current?.abort();
    setBusy(false);
    setServiceBusy(false);
    setSuggestions(emptySuggestions());
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
  async function searchServices() {
    serviceRequest.current?.abort();
    const controller = new AbortController();
    serviceRequest.current = controller;
    setError("");
    setServiceBusy(true);
    try {
      const result = await api(
        "/api/quotes?" +
          new URLSearchParams({
            lookup: "services",
            company: quote.company,
            q: serviceSearch,
          }),
        { signal: controller.signal },
      );
      setSuggestions((s) => {
        const map = new Map(s.items.map((i) => [i.key, i]));
        for (const i of result.items) if (!map.has(i.key)) map.set(i.key, i);
        return {
          ...s,
          items: [...map.values()],
          warnings: result.truncated
            ? [
                ...s.warnings,
                "Há mais serviços. Refine a pesquisa para localizar outros itens.",
              ]
            : s.warnings,
        };
      });
      setKind("service");
      setFilter("");
      setMessage(
        result.items.length
          ? "Serviços adicionados à lista de sugestões."
          : "Nenhum serviço encontrado para essa pesquisa.",
      );
    } catch (e) {
      if (!controller.signal.aborted) setError((e as Error).message);
    } finally {
      if (!controller.signal.aborted) setServiceBusy(false);
    }
  }
  function updateItem(item: QuoteItem, patch: Partial<QuoteItem>) {
    setQuote((q) => ({
      ...q,
      items: q.items.some((i) => i.key === item.key)
        ? q.items.map((i) => (i.key === item.key ? { ...i, ...patch } : i))
        : [...q.items, { ...item, ...patch }],
    }));
    setDirty(true);
    setMessage("");
  }
  function addManual(kind: QuoteItem["kind"]) {
    const i: QuoteItem = {
      key: "manual:" + crypto.randomUUID(),
      kind,
      code: "",
      name: kind === "material" ? "Novo material" : "Novo serviço",
      unit: "",
      quantity: "1",
      price: "",
      selected: true,
      source: "Inclusão manual",
      referencePrice: "",
      minimumPrice: "",
      lastPrice: "",
      referenceAt: "",
    };
    change({ items: [...quote.items, i] });
    setKind(kind);
    setFilter("");
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
      setQuote(saved);
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
  const rows = [...all.values()].filter(
    (i) =>
      (kind === "all" || i.kind === kind) &&
      [i.name, i.code, i.source]
        .join(" ")
        .toLocaleLowerCase("pt-BR")
        .includes(filter.toLocaleLowerCase("pt-BR")),
  );
  const totals = quoteTotals(quote.items);
  return (
    <>
      <SiteHeader active="quotes" email={email} />
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
                <span>{d.client_name}</span>
                <small>{d.equipment}</small>
                <span>{money(Number(d.total_cents))}</span>
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
                  <QuoteLookup<Client>
                    key={
                      "client-" +
                      (quote.id || "new") +
                      "-" +
                      quote.clientId +
                      "-" +
                      quote.client
                    }
                    label="Cliente *"
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
                    label="Equipamento *"
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
                    Tipo de manutenção *
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
                      <option value="">Todas as versões candidatas</option>
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
                <h2>Materiais e serviços</h2>
                <p className="muted">
                  Marque os itens que deseja incluir. As quantidades começam em
                  1; confira a necessidade da revisão.
                </p>
                <div className="quote-toolbar">
                  <label>
                    Buscar serviço na base
                    <input
                      value={serviceSearch}
                      onChange={(e) => setServiceSearch(e.target.value)}
                      placeholder="Descrição ou código"
                    />
                  </label>
                  <button
                    className="secondary-button"
                    onClick={searchServices}
                    disabled={serviceSearch.trim().length < 2 || serviceBusy}
                  >
                    <Search size={16} />
                    {serviceBusy ? "Buscando…" : "Buscar serviços"}
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() => addManual("material")}
                  >
                    <Plus size={16} /> Material manual
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() => addManual("service")}
                  >
                    <Plus size={16} /> Serviço manual
                  </button>
                </div>
                <div className="quote-toolbar">
                  <label>
                    Filtrar sugestões
                    <input
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                      placeholder="Descrição, código ou origem"
                    />
                  </label>
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
                  <span>
                    {rows.length} itens na lista ·{" "}
                    {quote.items.filter((i) => i.selected).length} selecionados
                  </span>
                </div>
                {!rows.length && (
                  <p className="quote-empty">
                    Busque sugestões pelo equipamento, pesquise um serviço ou
                    inclua um item manual.
                  </p>
                )}
                <div className="quote-item-list">
                  {rows.map((i) => {
                    const amount = lineAmount(i),
                      below =
                        i.selected &&
                        i.minimumPrice !== "" &&
                        i.price !== "" &&
                        Number(i.price) < Number(i.minimumPrice);
                    return (
                      <article
                        className={
                          "quote-item " +
                          (i.selected ? "quote-item-selected" : "")
                        }
                        key={i.key}
                      >
                        <label className="quote-item-check">
                          <input
                            type="checkbox"
                            checked={i.selected}
                            onChange={(e) =>
                              updateItem(i, { selected: e.target.checked })
                            }
                            aria-label={"Incluir " + i.name}
                          />
                          <span>
                            {i.kind === "material" ? "Material" : "Serviço"}
                          </span>
                        </label>
                        <div className="quote-item-main">
                          {i.key.startsWith("manual:") ? (
                            <label>
                              Descrição
                              <input
                                value={i.name}
                                maxLength={500}
                                onChange={(e) =>
                                  updateItem(i, { name: e.target.value })
                                }
                              />
                            </label>
                          ) : (
                            <strong>{i.name}</strong>
                          )}
                          <small>
                            Código: {i.code || "Não informado"}
                            {i.unit ? " · " + i.unit : ""}
                          </small>
                          <details>
                            <summary>Origem e referências</summary>
                            <p>{i.source}</p>
                            <p>
                              Venda atual: {reference(i.referencePrice)} ·
                              Mínimo atual: {reference(i.minimumPrice)} · Último
                              valor unitário: {reference(i.lastPrice)}
                            </p>
                            {i.referenceAt && (
                              <small>
                                Referência coletada/registrada em{" "}
                                {new Date(i.referenceAt).toLocaleDateString(
                                  "pt-BR",
                                  { timeZone: "America/Sao_Paulo" },
                                )}
                              </small>
                            )}
                          </details>
                          <div className="quote-price-references">
                            {i.referencePrice !== "" && (
                              <button
                                onClick={() =>
                                  updateItem(i, {
                                    price: Number(i.referencePrice).toFixed(2),
                                  })
                                }
                              >
                                Usar venda: {reference(i.referencePrice)}
                              </button>
                            )}
                            {i.lastPrice !== "" && (
                              <button
                                onClick={() =>
                                  updateItem(i, {
                                    price: Number(i.lastPrice).toFixed(2),
                                  })
                                }
                              >
                                Usar último: {reference(i.lastPrice)}
                              </button>
                            )}
                          </div>
                          {below && (
                            <small className="quote-warning">
                              Valor abaixo do mínimo atual de referência:{" "}
                              {reference(i.minimumPrice)}.
                            </small>
                          )}
                        </div>
                        <div className="quote-item-numbers">
                          <label>
                            Quantidade
                            <input
                              type="number"
                              min="0.001"
                              max="1000000"
                              step="0.001"
                              value={i.quantity}
                              onChange={(e) =>
                                updateItem(i, { quantity: e.target.value })
                              }
                            />
                          </label>
                          {(i.key.startsWith("manual:") ||
                            !suggestions.items.find((x) => x.key === i.key)
                              ?.unit) && (
                            <label>
                              Unidade
                              <input
                                maxLength={60}
                                value={i.unit}
                                placeholder="Ex.: UN, H"
                                onChange={(e) =>
                                  updateItem(i, { unit: e.target.value })
                                }
                              />
                            </label>
                          )}
                          <label>
                            Valor unitário (R$)
                            <input
                              type="number"
                              min="0"
                              max="10000000"
                              step="0.01"
                              value={i.price}
                              onChange={(e) =>
                                updateItem(i, { price: e.target.value })
                              }
                              placeholder="Informar"
                            />
                          </label>
                          <strong>Total: {money(amount)}</strong>
                          {i.selected && amount === null && (
                            <small className="quote-warning">
                              Preencha quantidade e preço.
                            </small>
                          )}
                          {i.key.startsWith("manual:") && (
                            <button
                              className="icon-button"
                              aria-label={"Remover " + i.name}
                              onClick={() =>
                                change({
                                  items: quote.items.filter(
                                    (x) => x.key !== i.key,
                                  ),
                                })
                              }
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
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
                    disabled={saving || totals.invalid > 0}
                    onClick={save}
                  >
                    <Save size={17} />
                    {saving ? "Salvando…" : "Salvar rascunho"}
                  </button>
                  <small>
                    Os preços ficam gravados no rascunho. Não há envio ao M8 nem
                    reserva de estoque.
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
