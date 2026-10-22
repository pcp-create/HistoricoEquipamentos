"use client";
import { useEffect, useState, useRef } from "react";
import { Search, X } from "lucide-react";
export default function ServiceOrderPicker({
  kind,
  customer,
  type,
  onSelect,
  onClose,
}: {
  kind: "customers" | "equipment";
  customer: string;
  type: string;
  onSelect: (r: { id: string; name: string }) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    [q, setQ] = useState(""),
    [page, setPage] = useState(1),
    [rows, setRows] = useState<{ id: string; name: string }[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  useEffect(() => {
    const c = new AbortController();
    setBusy(true);
    setError("");
    const timer = setTimeout(async () => {
      try {
        const r = await fetch(
          "/api/service-orders?" +
            new URLSearchParams({
              lookup: kind,
              customer,
              type,
              q,
              page: String(page),
            }),
          { signal: c.signal },
        );
        const d = await r.json();
        if (!r.ok) throw Error(d.error);
        setRows(d.rows);
      } catch (e) {
        if (!c.signal.aborted)
          setError(e instanceof Error ? e.message : "Consulta indisponível.");
      } finally {
        if (!c.signal.aborted) setBusy(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      c.abort();
    };
  }, [q, page, kind, customer, type]);
  return (
    <dialog ref={dialog} className="os-picker" onCancel={onClose}>
      <header>
        <h2>Selecionar {kind === "customers" ? "cliente" : "equipamento"}</h2>
        <button type="button" aria-label="Fechar" onClick={onClose}>
          <X size={20} />
        </button>
      </header>
      <label>
        <Search size={16} /> Pesquisar
        <input
          autoFocus
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          placeholder="Código, nome ou identificação"
        />
      </label>
      {error && <p role="alert">{error}</p>}
      <div className="os-picker-results">
        {busy ? (
          <p>Carregando…</p>
        ) : (
          rows.slice(0, 30).map((r) => (
            <button type="button" key={r.id} onClick={() => onSelect(r)}>
              {r.name}
            </button>
          ))
        )}
        {!busy && !rows.length && <p>Nenhum cadastro encontrado.</p>}
      </div>
      <footer>
        <button
          type="button"
          disabled={busy || page === 1}
          onClick={() => setPage(page - 1)}
        >
          Anterior
        </button>
        <span>Página {page}</span>
        <button
          type="button"
          disabled={busy || rows.length <= 30}
          onClick={() => setPage(page + 1)}
        >
          Próxima
        </button>
      </footer>
    </dialog>
  );
}
