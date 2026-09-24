"use client";
import { apiFetch } from "@/lib/client-api-cache";
import { companyName } from "@/lib/company-names";
import { useEffect, useRef, useState } from "react";
import QuoteOrderLink from "./quote-order-link";
import { quoteItemIdentity, type QuoteItem } from "@/lib/quotes/types";
const money = (v: string) =>
  v === ""
    ? "—"
    : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export default function QuoteCatalogPicker({
  kind,
  existing,
  onAdd,
  onClose,
}: {
  kind: QuoteItem["kind"];
  existing: Set<string>;
  onAdd: (item: QuoteItem) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState(""),
    [page, setPage] = useState(1);
  const [items, setItems] = useState<QuoteItem[]>([]),
    [more, setMore] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setItems([]);
    setMore(false);
    setError("");
    const timer = setTimeout(async () => {
      try {
        const response = await apiFetch(
          "/api/quotes?" +
            new URLSearchParams({
              lookup: kind === "material" ? "materials" : "services",
              q: query,
              page: String(page),
            }),
          { signal: controller.signal },
        );
        if (response.status === 401) {
          window.location.assign("/login");
          return;
        }
        const result = await response.json();
        if (!response.ok)
          throw new Error(
            result.error || "Não foi possível consultar o cadastro.",
          );
        if (!controller.signal.aborted) {
          setItems(result.items);
          setMore(result.truncated);
        }
      } catch (e) {
        if (!controller.signal.aborted) setError((e as Error).message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [kind, query, page]);
  return (
    <dialog
      ref={dialog}
      className="quote-catalog-dialog"
      aria-labelledby="quote-catalog-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <header>
        <div>
          <h2 id="quote-catalog-title">
            {kind === "material" ? "Adicionar material" : "Adicionar serviço"}
          </h2>
          <p>Cadastro geral · todas as empresas, clientes e equipamentos</p>
        </div>
        <button type="button" className="secondary-button" onClick={onClose}>
          Fechar
        </button>
      </header>
      <label>
        Pesquisar no cadastro
        <input
          autoFocus
          value={query}
          maxLength={120}
          placeholder="Nome, código ou referência"
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
            setItems([]);
            setLoading(true);
          }}
        />
      </label>
      <small>
        A pesquisa atualiza enquanto você digita. A última venda abaixo é geral,
        não apenas deste cliente. Itens já presentes na lista ficam bloqueados
        para nova inclusão.
      </small>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="quote-catalog-options" aria-busy={loading}>
        {loading ? (
          <p role="status">Buscando no cadastro…</p>
        ) : items.length === 0 ? (
          <p>Nenhum cadastro encontrado.</p>
        ) : (
          items.map((item) => (
            <article key={item.key}>
              <div>
                <strong>{item.name}</strong>
                <small>
                  Cód. {item.code} · {item.unit || "Unidade não informada"}
                </small>
                <small>
                  Venda M8: {money(item.referencePrice)} · Mínimo M8:{" "}
                  {money(item.minimumPrice)}
                </small>
                <small>
                  Última venda geral:{" "}
                  {item.generalSale ? (
                    <>
                      {money(item.generalSale.unitPrice)} ·{" "}
                      <QuoteOrderLink sale={item.generalSale} /> ·{" "}
                      {companyName(item.generalSale.company)}
                    </>
                  ) : (
                    "Sem venda registrada"
                  )}
                </small>
                {item.generalSale?.customer && (
                  <small>{item.generalSale.customer}</small>
                )}
              </div>
              <button
                type="button"
                className="secondary-button"
                disabled={existing.has(quoteItemIdentity(item))}
                onClick={() => onAdd(item)}
              >
                {existing.has(quoteItemIdentity(item))
                  ? "Já incluído"
                  : "Adicionar"}
              </button>
            </article>
          ))
        )}
      </div>
      <footer>
        <button
          type="button"
          className="secondary-button"
          disabled={page === 1 || loading}
          onClick={() => setPage((p) => p - 1)}
        >
          Anterior
        </button>
        <span>Página {page}</span>
        <button
          type="button"
          className="secondary-button"
          disabled={!more || loading}
          onClick={() => setPage((p) => p + 1)}
        >
          Próxima
        </button>
      </footer>
    </dialog>
  );
}
