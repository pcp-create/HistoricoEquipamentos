"use client";
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
      {!initiallyOpen && <button onClick={() => setOpen(!open)} aria-expanded={open}>
        Vincular OS
      </button>}
      {open && (
        <div>
          {error && <p role="alert">{error}</p>}
          {link?.linked_order_id ? (
            <p>
              Vinculada:{" "}
              <strong>
                OS-{link.numero_sequencia || link.linked_order_id}
              </strong>{" "}
              · {companyName(link.linked_company_id)} ·{" "}
              {link.status_lancamento_nome || "Status não informado"}{" "}
              <button disabled={busy || !ready} onClick={() => void save(null)}>
                Remover vínculo
              </button>
            </p>
          ) : (
            <p>{ready ? "Nenhuma OS vinculada." : "Carregando vínculo…"}</p>
          )}
          <label>
            Pesquisar OS
            <input
              placeholder="Número, cliente, equipamento ou status"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
            />
          </label>
          <small>
            Selecione uma OS. O vínculo é salvo ao clicar e o status acompanha
            os dados importados da ordem vinculada.
          </small>
          <div className="order-link-results" aria-busy={searching || busy}>
            {searching ? (
              <p>Pesquisando…</p>
            ) : (
              results.orders.map((o: any) => (
                <button
                  key={o.company_id + ":" + o.id}
                  disabled={busy || !ready}
                  aria-pressed={
                    String(link?.linked_order_id) === o.id &&
                    Number(link?.linked_company_id) === Number(o.company_id)
                  }
                  onClick={() => void save(o)}
                >
                  <strong>
                    OS-{o.number} · {companyName(o.company_id)}
                  </strong>
                  <span>{o.cliente_nome || "Cliente não informado"}</span>
                  <small>
                    {o.equipamento || "—"} · {o.status_lancamento_nome || "—"}
                  </small>
                </button>
              ))
            )}
            {!searching && !results.orders.length && (
              <p>Nenhuma OS encontrada.</p>
            )}
          </div>
          <div>
            <button
              disabled={page === 0 || searching}
              onClick={() => setPage(page - 1)}
            >
              Anterior
            </button>{" "}
            <span>Página {page + 1}</span>{" "}
            <button
              disabled={!results.hasMore || searching}
              onClick={() => setPage(page + 1)}
            >
              Próxima
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
