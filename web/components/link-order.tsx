"use client";
import { Link2, Search, Unlink, ChevronLeft, ChevronRight, Check, ArrowUpRight, LoaderCircle } from "lucide-react";
import "./link-order.css";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/client-api-cache";
import { companyName } from "@/lib/company-names";
export default function LinkOrder({
  company,
  id,
  initiallyOpen = false,
}: {
  company: number | string;
  id: string;
  initiallyOpen?: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen),
    [link, setLink] = useState<any>(null),
    [ready, setReady] = useState(false),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(0),
    [results, setResults] = useState<any>({ orders: [], hasMore: false }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [searching, setSearching] = useState(false);
  const url = `/api/orders/${company}/${id}/link`;
  useEffect(() => {
    if (!open) return;
    const c = new AbortController();
    setReady(false);
    apiFetch(url, { signal: c.signal })
      .then(async (r) => {
        const b = await r.json();
        if (!r.ok) throw Error(b.error);
        setLink(b.link);
        setReady(true);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => c.abort();
  }, [open, url]);
  useEffect(() => {
    if (!open) return;
    const c = new AbortController();
    setSearching(true);
    const timer = setTimeout(() => {
      apiFetch(
        url + "?" + new URLSearchParams({ q: query, page: String(page) }),
        { signal: c.signal },
      )
        .then(async (r) => {
          const b = await r.json();
          if (!r.ok) throw Error(b.error);
          setResults(b);
          setSearching(false);
        })
        .catch((e) => {
          if (e.name !== "AbortError") {
            setError(e.message);
            setSearching(false);
          }
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      c.abort();
    };
  }, [open, url, query, page]);
  async function save(order: any) {
    if (busy || !ready) return;
    const before = link;
    setBusy(true);
    setError("");
    setLink(
      order
        ? {
            ...link,
            linked_company_id: order.company_id,
            linked_order_id: order.id,
            numero_sequencia: order.number,
            cliente_nome: order.cliente_nome,
            status_lancamento_nome: order.status_lancamento_nome,
          }
        : null,
    );
    try {
      const r = await apiFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          version: before?.version ?? null,
          target: order ? { company: order.company_id, id: order.id } : null,
        }),
      });
      const b = await r.json();
      if (!r.ok) throw Error(b.error);
      setLink({
        ...b.link,
        numero_sequencia: order?.number,
        cliente_nome: order?.cliente_nome,
        status_lancamento_nome: order?.status_lancamento_nome,
      });
      window.dispatchEvent(new Event("order-link-updated"));
    } catch (e) {
      setLink(before);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="order-link-editor">
      {!initiallyOpen && <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}><Link2 size={16}/> Vincular OS</button>}
      {open && <div className="order-link-body">
        {error && <p role="alert" className="order-link-error">{error}</p>}
        <div className={`order-link-current ${link?.linked_order_id ? "has-link" : ""}`}>
          <span className="order-link-current-icon"><Link2 size={20}/></span>
          <div className="order-link-current-info">
            <small>VÍNCULO ATUAL</small>
            {link?.linked_order_id ? <>
              <strong>OS-{link.numero_sequencia || link.linked_order_id} <span>· {companyName(link.linked_company_id)}</span></strong>
              {link.cliente_nome && <p>{link.cliente_nome}</p>}
              <small>{link.status_lancamento_nome || "Status não informado"}</small>
            </> : <p>{ready ? "Nenhuma OS vinculada" : "Carregando vínculo…"}</p>}
          </div>
          {link?.linked_order_id && <button type="button" className="order-link-remove" disabled={busy || !ready} onClick={() => void save(null)}><Unlink size={14}/> Remover</button>}
        </div>
        <label className="order-link-search-label">
          Pesquisar ordem de serviço
          <span className="order-link-search"><Search size={18} aria-hidden="true"/><input placeholder="Número, cliente, equipamento ou status" value={query} onChange={e => {setQuery(e.target.value);setPage(0);}}/></span>
        </label>
        <div className="order-link-list-heading"><strong>Ordens disponíveis</strong><span>{busy ? "Salvando vínculo…" : "Clique em uma OS para vincular"}</span></div>
        <div className="order-link-results" aria-busy={searching || busy}>
          {searching ? <p className="order-link-empty" role="status"><LoaderCircle size={18}/> Pesquisando ordens…</p> : results.orders.map((o: any) => {
            const selected = String(link?.linked_order_id) === String(o.id) && Number(link?.linked_company_id) === Number(o.company_id);
            return <button type="button" key={o.company_id + ":" + o.id} disabled={busy || !ready} aria-pressed={selected} className="order-link-result" onClick={() => void save(o)}>
              <span className="order-link-result-heading"><strong>OS-{o.number}</strong><span className="order-link-company">{companyName(o.company_id)}</span>{selected ? <Check size={17} className="order-link-result-action"/> : <ArrowUpRight size={17} className="order-link-result-action"/>}</span>
              <span className="order-link-client">{o.cliente_nome || "Cliente não informado"}</span>
              {o.equipamento && <span className="order-link-equipment">{o.equipamento}</span>}
              <small className="order-link-flow">{o.status_lancamento_nome || "Status não informado"}</small>
            </button>;
          })}
          {!searching && !results.orders.length && <p className="order-link-empty">Nenhuma OS encontrada. Tente outro número ou cliente.</p>}
        </div>
        <div className="order-link-pagination">
          <button type="button" disabled={busy || page === 0 || searching} onClick={() => setPage(page - 1)}><ChevronLeft size={15}/> Anterior</button>
          <span>Página {page + 1}</span>
          <button type="button" disabled={busy || !results.hasMore || searching} onClick={() => setPage(page + 1)}>Próxima <ChevronRight size={15}/></button>
        </div>
      </div>}
    </section>
  );
}
