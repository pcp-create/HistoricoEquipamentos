"use client";
import { apiFetch } from "@/lib/client-api-cache";
import { useEffect, useState } from "react";
import type { QuoteItem, QuoteSalesHistory } from "@/lib/quotes/types";
import { compareQuoteItems } from "@/lib/quotes/presentation";
import { companyName } from "@/lib/company-names";
import QuoteOrderLink from "./quote-order-link";

type Client = { id: string; name: string; priority?: number };
const fold = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
const date = (v: string) =>
  v
    ? new Date(v).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })
    : "Sem data";
const money = (v: string) =>
  v === ""
    ? "Não informado"
    : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export default function PreventivePlanHistory({
  equipment,
  clients,
  existing,
  onAdd,
  disabled,
}: {
  equipment: { id: string; serial?: string; model?: string };
  clients: Client[];
  existing: Set<string>;
  onAdd: (i: QuoteItem) => void;
  disabled: boolean;
}) {
  const [clientId, setClientId] = useState(
    clients.length === 1 || clients[0]?.priority === 0 ? clients[0].id : "",
  );
  const [pickedClient, setPickedClient] = useState<Client | null>(null);
  const [clientQuery, setClientQuery] = useState("");
  const [choices, setChoices] = useState<Client[]>([]);
  const [items, setItems] = useState<QuoteItem[]>([]),
    [histories, setHistories] = useState<Record<string, QuoteSalesHistory>>({});
  const [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const [query, setQuery] = useState(""),
    [kind, setKind] = useState("all"),
    [page, setPage] = useState(1),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!clientQuery.trim()) {
      setChoices([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const r = await apiFetch(
          "/api/quotes?" +
            new URLSearchParams({ lookup: "clients", q: clientQuery }),
          { signal: controller.signal },
        );
        const b = await r.json();
        if (!r.ok) throw Error(b.error || "Não foi possível buscar clientes.");
        if (!controller.signal.aborted) setChoices(b.rows || []);
      } catch (e) {
        if (!controller.signal.aborted) setError((e as Error).message);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [clientQuery]);
  useEffect(() => {
    const controller = new AbortController();
    setItems([]);
    setHistories({});
    setError("");
    setPage(1);
    if (!clientId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    (async () => {
      try {
        const r = await apiFetch(
          "/api/quotes?" +
            new URLSearchParams({
              action: "suggestions",
              clientId,
              equipmentId: equipment.id,
              serial: equipment.serial || "",
              model: equipment.model || "",
            }),
          { signal: controller.signal },
        );
        if (r.status === 401) {
          window.location.assign(
            "/login?next=" +
              encodeURIComponent(
                window.location.pathname + window.location.search,
              ),
          );
          return;
        }
        const b = await r.json();
        if (!r.ok)
          throw Error(b.error || "Não foi possível consultar o histórico.");
        if (!controller.signal.aborted) {
          const history: Record<string, QuoteSalesHistory> = b.histories || {};
          setHistories(history);
          setItems(
            (b.items || [])
              .filter((i: QuoteItem) => history[i.key]?.count > 0)
              .sort((a: QuoteItem, b: QuoteItem) =>
                compareQuoteItems(a, b, history),
              ),
          );
        }
      } catch (e) {
        if (!controller.signal.aborted) setError((e as Error).message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [clientId, equipment.id, equipment.serial, equipment.model, retry]);
  const options = [
    ...clients,
    ...[...(pickedClient ? [pickedClient] : []), ...choices].filter(
      (c, index, all) =>
        !clients.some((v) => v.id === c.id) &&
        all.findIndex((v) => v.id === c.id) === index,
    ),
  ];
  const filtered = items.filter(
    (i) =>
      (kind === "all" || i.kind === kind) &&
      fold(`${i.code} ${i.name} ${i.unit}`).includes(fold(query.trim())),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 10));
  return (
    <section
      className="preventive-plan-history"
      aria-label="Sugestões do histórico da máquina"
    >
      <h4>Sugestões do histórico da máquina</h4>
      <p className="muted">
        Materiais e serviços de OS processadas, com coleta concluída e materiais
        aprovados, nas três empresas. A busca considera cliente e série; sem
        série válida, utiliza o ID do equipamento. O modelo não restringe o
        histórico.
      </p>
      <div className="equipment-form-grid">
        <label>
          Cliente do histórico
          <select
            value={clientId}
            disabled={disabled}
            onChange={(e) => {
              setClientId(e.target.value);
              setPickedClient(
                options.find((c) => c.id === e.target.value) || null,
              );
            }}
          >
            <option value="">Selecione o cliente</option>
            {options.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Buscar outro cliente
          <input
            type="search"
            value={clientQuery}
            maxLength={120}
            placeholder="Nome ou documento"
            disabled={disabled}
            onChange={(e) => setClientQuery(e.target.value)}
          />
        </label>
      </div>
      {!clientId && (
        <p>
          Selecione o cliente para consultar as peças e serviços utilizados
          nessa máquina.
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}{" "}
          <button type="button" onClick={() => setRetry((n) => n + 1)}>
            Tentar novamente
          </button>
        </p>
      )}
      {loading && <p role="status">Buscando histórico da máquina…</p>}
      {clientId && !loading && !error && (
        <>
          <div className="equipment-form-grid">
            <label>
              Filtrar sugestões
              <input
                type="search"
                value={query}
                placeholder="Código ou descrição"
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
              />
            </label>
            <label>
              Tipo de item
              <select
                value={kind}
                onChange={(e) => {
                  setKind(e.target.value);
                  setPage(1);
                }}
              >
                <option value="all">Materiais e serviços</option>
                <option value="material">Materiais</option>
                <option value="service">Serviços</option>
              </select>
            </label>
          </div>
          <p className="muted">
            {filtered.length} sugestões · mais recentes primeiro. Quantidades
            anteriores são referência; confira o consumo previsto para esta
            revisão. Uma OS pode incluir mais de uma máquina.
          </p>
          <div className="equipment-table">
            <table>
              <thead>
                <tr>
                  <th>Item utilizado</th>
                  <th>Última utilização</th>
                  <th>Histórico</th>
                  <th>Ação</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice((page - 1) * 10, page * 10).map((i) => {
                  const h = histories[i.key],
                    last = h.rows[0],
                    added = existing.has(`${i.kind}:${i.code}`),
                    valid = /^[1-9]\d{0,17}$/.test(i.code);
                  return (
                    <tr key={i.key}>
                      <td>
                        <strong>{i.name}</strong>
                        <small>
                          {i.kind === "material" ? "Material" : "Serviço"} ·
                          Cód. {i.code || "não informado"} · {i.unit}
                        </small>
                      </td>
                      <td>
                        {last && (
                          <>
                            {date(last.date)} · <QuoteOrderLink sale={last} />
                            <small>
                              {companyName(last.company)} · Qtd.:{" "}
                              {last.quantity} {i.unit}
                            </small>
                            <small>
                              Unitário na OS: {money(last.unitPrice)}
                            </small>
                          </>
                        )}
                      </td>
                      <td>
                        <details>
                          <summary>{h.count} OS · ver histórico</summary>
                          {h.rows.map((r, index) => (
                            <p key={index}>
                              <QuoteOrderLink sale={r} /> ·{" "}
                              {companyName(r.company)} · {date(r.date)}
                              <small>
                                Qtd.: {r.quantity} {i.unit} ·{" "}
                                {money(r.unitPrice)}
                              </small>
                            </p>
                          ))}
                          {h.count > h.rows.length && (
                            <small>
                              Exibindo as {h.rows.length} utilizações mais
                              recentes.
                            </small>
                          )}
                        </details>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="secondary-button"
                          disabled={disabled || added || !valid}
                          onClick={() => onAdd(i)}
                        >
                          {added ? "Já incluído" : "Incluir no plano"}
                        </button>
                        {!valid && (
                          <small>
                            Localize este item no cadastro para incluí-lo.
                          </small>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!filtered.length && (
            <p>
              Nenhum item encontrado para os filtros do histórico. Você pode
              adicionar pelo cadastro geral abaixo.
            </p>
          )}
          {pages > 1 && (
            <div className="catalog-editor-actions">
              <button
                type="button"
                disabled={page === 1}
                onClick={() => setPage((n) => n - 1)}
              >
                Anterior
              </button>
              <span>
                Página {page} de {pages}
              </span>
              <button
                type="button"
                disabled={page === pages}
                onClick={() => setPage((n) => n + 1)}
              >
                Próxima
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
