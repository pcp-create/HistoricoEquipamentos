"use client";
import { matchesSearch } from "@/lib/filters";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Check } from "lucide-react";
import "./order-search-select.css";
export type OrderChoice = {
  id: string;
  displayId?: string;
  name: string;
  detail?: string;
  tradeName?: string;
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
  menuHeader,
  value,
  selectedLabel,
  options = [],
  endpoint,
  disabled = false,
  placeholder = "Selecione",
  onChange,
}: {
  label: string;
  menuHeader?: ReactNode;
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
    trigger = useRef<HTMLInputElement>(null),
    list = useRef<HTMLDivElement>(null),
    search = trigger;
  const [active,setActive] = useState(-1);
  const [open, setOpen] = useState(false),
    [q, setQ] = useState(""),
    [page, setPage] = useState(1),
    [remote, setRemote] = useState<OrderChoice[]>([]),
    [more, setMore] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const close = () => {
    trigger.current?.focus();
    setOpen(false);
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
    if(disabled)setOpen(false);
    setActive(-1);
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
        matchesSearch(fold(`${r.displayId ?? r.id} ${r.name} ${r.tradeName || ""} ${r.detail || ""}`), fold(q)),
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
        if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget as Node))
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
      <input
        ref={trigger}
        type="text"
        role="combobox"
        aria-label={label}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-activedescendant={open && active >= 0 ? id+'-'+active : undefined}
        disabled={disabled}
        autoComplete="off"
        className="order-search-trigger order-search-direct"
        value={open ? q : selectedLabel || (selected ? (selected.displayId ? `${selected.displayId} - ${selected.name}` : selected.name) : '')}
        placeholder={open ? 'Pesquisar por ID ou descrição' : placeholder}
        onFocus={()=>{if(!open){setQ('');setPage(1);setRemote([]);setActive(-1);setOpen(true)}}}
        onClick={()=>{if(!open){setQ('');setPage(1);setRemote([]);setActive(-1);setOpen(true)}}}
        onChange={e=>{setQ(e.target.value);setPage(1);setRemote([]);setActive(-1);setOpen(true)}}
        onKeyDown={e=>{
          if(e.key==='ArrowDown'||e.key==='ArrowUp'){
            e.preventDefault();setOpen(true);
            const available=rows.map((row,index)=>({row,index})).filter(x=>!x.row.disabled);
            if(!available.length)return;
            const current=available.findIndex(x=>x.index===active);
            const next=available[current<0?(e.key==='ArrowDown'?0:available.length-1):(current+(e.key==='ArrowDown'?1:-1)+available.length)%available.length].index;
            setActive(next);document.getElementById(id+'-'+next)?.scrollIntoView({block:'nearest'});
          }
          if(e.key==='Enter'&&open){e.preventDefault();if(!busy){if(active>=0&&rows[active])pick(rows[active]);else if(rows.length===1)pick(rows[0])}}
        }}
      />
      {open && (
        <div className="order-search-menu">
          {menuHeader && <div className="order-search-menu-header">{menuHeader}</div>}
          <div
            ref={list}
            id={id}
            role="listbox"
            aria-label={label}
            className="order-search-options"
            aria-busy={busy}
          >
            {rows.map((row,index) => (
              <button
                type="button"
                role="option"
                aria-selected={row.id === value}
                key={row.id}
                id={id+'-'+index}
                data-active={active===index}
                tabIndex={-1}
                onMouseDown={e=>e.preventDefault()}
                disabled={
                  row.disabled ||
                  options.some((o) => o.id === row.id && o.disabled)
                }
                onClick={(e) => {
                  // A wrapping label must not forward this click back to the input
                  // after the option is removed, reopening the selected list.
                  e.preventDefault();
                  pick(row);
                }}
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
                  {row.tradeName && <small className="order-choice-trade-name">{row.tradeName}</small>}
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
