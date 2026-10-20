"use client";
import { useId, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import type { VisitCustomer } from "@/lib/visits/model";
const fold = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export default function SalesCustomerSelect({ customers, value, onChange }: {
  customers: VisitCustomer[]; value: string; onChange: (key: string) => void;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const options = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = customers.find(c => c.key === value);
  const filtered = customers.filter(c => fold(`${c.name} ${c.document} ${c.city} ${c.uf}`).includes(fold(query)));
  const close = () => { setOpen(false); trigger.current?.focus(); };
  return <div className="sales-customer-select" onBlur={e => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
  }} onKeyDown={e => { if (e.key === "Escape" && open) { e.preventDefault(); e.stopPropagation(); close(); } }}>
    <label id={id + "-label"} htmlFor={id}>Cliente</label>
    <button id={id} ref={trigger} type="button" role="combobox" aria-labelledby={id + "-label"}
      aria-expanded={open} aria-haspopup="listbox" aria-controls={id + "-list"} aria-required="true"
      className="sales-customer-select-trigger"
      onClick={() => { setQuery(""); setOpen(!open); }}
      onKeyDown={e => { if (e.key === "ArrowDown") { e.preventDefault(); setQuery(""); setOpen(true); } }}>
      <span>{selected ? `${selected.name} · ${selected.city}/${selected.uf}` : "Selecione o cliente"}</span><ChevronDown size={18} />
    </button>
    {open && <div className="sales-customer-select-dropdown">
      <div className="sales-customer-select-search"><Search size={17} /><input ref={search} autoFocus type="search"
        aria-label="Pesquisar cliente" placeholder="Nome, documento ou cidade" value={query}
        onChange={e => setQuery(e.target.value)} onKeyDown={e => {
          if (e.key === "ArrowDown") { e.preventDefault(); options.current?.querySelector<HTMLButtonElement>("button")?.focus(); }
          if (e.key === "Enter") { e.preventDefault(); if (filtered.length === 1) { onChange(filtered[0].key); close(); } }
        }} /></div>
      <div ref={options} id={id + "-list"} role="listbox" aria-label="Clientes" className="sales-customer-select-options">
        {filtered.map(c => <button key={c.key} type="button" role="option" aria-selected={c.key === value}
          onClick={() => { onChange(c.key); close(); }} onKeyDown={e => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              const next = e.key === "ArrowDown" ? e.currentTarget.nextElementSibling : e.currentTarget.previousElementSibling;
              if (next instanceof HTMLButtonElement) next.focus(); else if (e.key === "ArrowUp") search.current?.focus();
            }
          }}><span><strong>{c.name}</strong><small>{c.city}/{c.uf} · {c.document || c.key}</small></span>{c.key === value && <Check size={17} />}</button>)}
      </div>
      {!filtered.length && <p role="status" className="sales-muted">Nenhum cliente encontrado.</p>}
    </div>}
  </div>;
}
