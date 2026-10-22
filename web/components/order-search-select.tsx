"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
export type OrderChoice = {
  id: string;
  displayId?: string;
  name: string;
  detail?: string;
  disabled?: boolean;
  data?: any;
};
const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
export default function OrderSearchSelect({
  label,
  value,
  selectedLabel,
  options = [],
  endpoint,
  disabled = false,
  placeholder = "Selecione",
  onChange,
}: {
  label: string;
  value: string;
  selectedLabel?: string;
  options?: OrderChoice[];
  endpoint?: string;
  disabled?: boolean;
  placeholder?: string;
  onChange: (row: OrderChoice) => void;
}) {
  const id = useId(),
    root = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    list = useRef<HTMLDivElement>(null),
    search = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false),
    [q, setQ] = useState(""),
    [page, setPage] = useState(1),
    [remote, setRemote] = useState<OrderChoice[]>([]),
    [more, setMore] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  useEffect(() => {
    setOpen(false);
    setRemote([]);
    setPage(1);
  }, [endpoint, disabled]);
  useEffect(() => {
    if (!open || !endpoint) return;
    const c = new AbortController();
    setBusy(true);
    setError("");
    const timer = setTimeout(async () => {
      try {
        const url = new URL(endpoint, window.location.origin);
        url.searchParams.set("q", q);
        url.searchParams.set("page", String(page));
        const r = await fetch(url, { signal: c.signal, cache: "no-store" });
        const d = await r.json();
        if (!r.ok) throw Error(d.error || "Não foi possível carregar a lista.");
        if (c.signal.aborted) return;
        const rows: OrderChoice[] = d.items
          ? d.items.map((i: any) => ({
              id: i.code,
              name: i.name,
              detail: `ID ${i.code} · ${i.unit || ""}`,
              data: i,
            }))
          : (d.rows || [])
              .slice(0, 30)
              .map((i: any) => ({ ...i, detail: i.detail || `ID ${i.id}` }));
        setRemote((prev) =>
          page === 1
            ? rows
            : [
                ...prev,
                ...rows.filter((row) => !prev.some((p) => p.id === row.id)),
              ],
        );
        setMore(d.items ? Boolean(d.truncated) : d.rows.length > 30);
      } catch (e) {
        if (!c.signal.aborted)
          setError(
            e instanceof Error ? e.message : "Não foi possível carregar.",
          );
      } finally {
        if (!c.signal.aborted) setBusy(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      c.abort();
    };
  }, [open, endpoint, q, page]);
  const rows = endpoint
    ? remote
    : options.filter((r) =>
        fold(`${r.displayId ?? r.id} ${r.name} ${r.detail || ""}`).includes(fold(q)),
      );
  const selected = options.find((r) => r.id === value);
  function pick(row: OrderChoice) {
    if (row.disabled) return;
    onChange(row);
    close();
  }
  return (
    <div
      className="order-search-select"
      ref={root}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null))
          setOpen(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.preventDefault();
          e.stopPropagation();
          close();
        }
      }}
    >
      <button
        ref={trigger}
        type="button"
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        aria-haspopup="listbox"
        disabled={disabled}
        className="order-search-trigger"
        onClick={() => {
          setQ("");
          setPage(1);
          setRemote([]);
          setOpen(!open);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span>{selectedLabel || (selected ? (selected.displayId ? `${selected.displayId} - ${selected.name}` : selected.name) : placeholder)}</span>
        <ChevronDown size={18} />
      </button>
      {open && (
        <div className="order-search-menu">
          <div className="order-search-input">
            <Search size={17} />
            <input
              ref={search}
              autoFocus
              type="search"
              aria-label={"Pesquisar " + label}
              placeholder="Pesquisar por ID ou descrição"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
                setRemote([]);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (!busy && rows.length === 1) pick(rows[0]);
                }
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  list.current
                    ?.querySelector<HTMLButtonElement>("button:not(:disabled)")
                    ?.focus();
                }
              }}
            />
          </div>
          <div
            ref={list}
            id={id}
            role="listbox"
            aria-label={label}
            className="order-search-options"
            aria-busy={busy}
          >
            {rows.map((row) => (
              <button
                type="button"
                role="option"
                aria-selected={row.id === value}
                key={row.id}
                disabled={
                  row.disabled ||
                  options.some((o) => o.id === row.id && o.disabled)
                }
                onClick={() => pick(row)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                    e.preventDefault();
                    const all = Array.from(
                      list.current!.querySelectorAll<HTMLButtonElement>(
                        "button:not(:disabled)",
                      ),
                    );
                    const index = all.indexOf(e.currentTarget);
                    const next = all[index + (e.key === "ArrowDown" ? 1 : -1)];
                    if (next) next.focus();
                    else if (e.key === "ArrowUp") search.current?.focus();
                  }
                }}
              >
                <span className="order-choice-content">
                  <span className="order-choice-line">
                    {(row.displayId ?? row.id) && <><span className="order-choice-id">{row.displayId ?? row.id}</span><span className="order-choice-separator" aria-hidden="true">-</span></>}
                    <strong>{row.name.startsWith(`${row.id} · `) ? row.name.slice(row.id.length + 3) : row.name}</strong>
                  </span>
                  {row.detail && row.detail !== row.id && row.detail !== `ID ${row.id}` && (
                    <small>{row.detail.startsWith(`ID ${row.id} · `) ? row.detail.slice(`ID ${row.id} · `.length) : row.detail}</small>
                  )}
                </span>
                {row.id === value && <Check size={16} />}
              </button>
            ))}
          </div>
          {busy && <p role="status">Carregando…</p>}
          {error && <p role="alert">{error}</p>}
          {!busy && !error && !rows.length && (
            <p role="status">Nenhum registro encontrado.</p>
          )}
          {more && !busy && !error && (
            <button
              className="order-search-more"
              type="button"
              onClick={() => setPage((p) => p + 1)}
            >
              Carregar mais
            </button>
          )}
        </div>
      )}
    </div>
  );
}
