"use client";
import { matchesSearch } from "@/lib/filters";

import { useEffect, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Factory,
  FileText,
  Printer,
  RefreshCw,
  Search,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import SiteHeader from "./site-header";
import "./customer-fleet.css";
const signals = [
  ["all", "Todas as máquinas"],
  ["ok", "Em dia"],
  ["attention", "Atenção"],
  ["critical", "Manutenção vencida"],
  ["workshop", "Em oficina"],
  ["unknown", "Dados a completar"],
];
const date = (v: string) =>
  v
    ? new Date(v.length === 10 ? v + "T12:00:00" : v).toLocaleDateString(
        "pt-BR",
        { timeZone: "America/Sao_Paulo" },
      )
    : "A definir";
const finalized = (o: any) => ["reviewed", "completed"].includes(o.status);
export default function CustomerFleet() {
  const [clients, setClients] = useState<any[]>([]),
    [client, setClient] = useState(""),
    [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [refresh, setRefresh] = useState(0),
    [filter, setFilter] = useState("all"),
    [query, setQuery] = useState(""),
    [expanded, setExpanded] = useState("");
  useEffect(() => {
    const c = new AbortController();
    fetch("/api/customer-fleet", { signal: c.signal })
      .then(async (r) => {
        const b = await r.json();
        if (!r.ok) throw Error(b.error);
        setClients(b.clients);
        if (b.clients.length) setClient(b.clients[0].id);
        else setLoading(false);
      })
      .catch((e) => {
        if (e.name !== "AbortError") {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => c.abort();
  }, []);
  useEffect(() => {
    if (!client) return;
    const c = new AbortController();
    setData(null);
    setLoading(true);
    setError("");
    setFilter("all");
    setExpanded("");
    fetch("/api/customer-fleet?customer=" + client, {
      signal: c.signal,
      cache: "no-store",
    })
      .then(async (r) => {
        const b = await r.json();
        if (!r.ok) throw Error(b.error);
        setData(b);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [client, refresh]);
  const machines: any[] = data?.machines || [],
    shown = machines.filter(
      (e) =>
        (filter === "all" || e.signal.key === filter) &&
        matchesSearch([e.name, e.serial, e.model, e.id]
          .join(" ")
          .toLocaleLowerCase("pt-BR"), query.toLocaleLowerCase("pt-BR")),
    );
  const events = machines
    .flatMap((m) =>
      m.operations
        .filter((o: any) => !finalized(o) && o.date)
        .map((o: any) => ({ ...o, machine: m.name })),
    )
    .sort((a, b) =>
      (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")),
    );
  const attention = machines.filter((e) =>
    ["attention", "critical"].includes(e.signal.key),
  ).length;
  return (
    <div className="fleet-shell">
      <SiteHeader active="equipmentClients" moduleId="equipamentos" />
      <main className="fleet-page">
        <header className="fleet-heading">
          <div>
            <span className="fleet-eyebrow">CLIENTE / EQUIPAMENTO</span>
            <h1>Seu parque de máquinas, em um olhar.</h1>
            <p>
              Acompanhe a manutenção, planeje os próximos cuidados e consulte os
              serviços realizados.
            </p>
          </div>
          <div className="fleet-toolbar">
            <button
              disabled={loading || !client}
              aria-label="Atualizar painel"
              title="Atualizar painel"
              onClick={() => setRefresh((x) => x + 1)}
            >
              <RefreshCw size={18} />
            </button>
            <button disabled={loading || !data} onClick={() => window.print()}>
              <Printer size={17} />
              Imprimir painel
            </button>
          </div>
        </header>
        <div className="fleet-client-picker">
          <label>
            Cliente
            <select
              value={client}
              onChange={(e) => {
                setClient(e.target.value);
                setQuery("");
              }}
            >
              <option value="">Selecione um cliente</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.id} - {c.name} ({c.machines})
                </option>
              ))}
            </select>
          </label>
          <span>
            <ShieldCheck size={17} />
            Visão gerencial de manutenção
          </span>
        </div>
        {error && (
          <p role="alert" className="fleet-error">
            {error}
          </p>
        )}
        {loading && <p role="status">Carregando o parque de máquinas…</p>}
        {data && (
          <>
            <section className="fleet-hero">
              <div>
                <span className="fleet-eyebrow">PANORAMA DO CLIENTE</span>
                <h2>{data.customer.name}</h2>
                <p>
                  {attention
                    ? `${attention} ${attention === 1 ? "máquina precisa" : "máquinas precisam"} de atenção no planejamento de manutenção.`
                    : "Nenhuma pendência preventiva identificada nos dados disponíveis."}
                </p>
                <small>
                  Atualizado em{" "}
                  {new Date(data.updatedAt).toLocaleString("pt-BR", {
                    timeZone: "America/Sao_Paulo",
                  })}
                </small>
              </div>
              <div className="fleet-total">
                <Factory size={30} />
                <strong>{machines.length}</strong>
                <span>máquinas acompanhadas</span>
              </div>
            </section>
            <nav className="fleet-signals" aria-label="Situação das máquinas">
              {signals.map(([key, label]) => (
                <button
                  key={key}
                  className={"fleet-count " + key}
                  aria-pressed={filter === key}
                  onClick={() => setFilter(key)}
                >
                  <span>
                    <i />
                    {label}
                  </span>
                  <strong>
                    {key === "all"
                      ? machines.length
                      : machines.filter((m) => m.signal.key === key).length}
                  </strong>
                  <small>
                    Ver máquinas <ArrowUpRight size={13} />
                  </small>
                </button>
              ))}
            </nav>
            <div className="fleet-body">
              <section>
                <div className="fleet-section-heading">
                  <div>
                    <h2>Máquinas e cuidados</h2>
                    <p>
                      O farol reflete os registros de manutenção, não a operação
                      em tempo real.
                    </p>
                  </div>
                  <label className="fleet-search">
                    <Search size={17} />
                    <input
                      aria-label="Buscar máquina"
                      placeholder="Máquina, modelo ou série"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </label>
                </div>
                <div className="fleet-machines">
                  {shown.map((m) => (
                    <article
                      className={"fleet-machine " + m.signal.key}
                      key={m.id}
                    >
                      <div className="fleet-machine-top">
                        <span className={"fleet-badge " + m.signal.key}>
                          <i />
                          {m.signal.label}
                        </span>
                        <small>Equipamento {m.id}</small>
                      </div>
                      <h3>{m.name}</h3>
                      <p className="fleet-identity">
                        {m.brand || "Marca não informada"} ·{" "}
                        {m.model || "Modelo não informado"}
                        <br />
                        Série: {m.serial || "Não informada"}
                      </p>
                      <p className="fleet-reason">{m.signal.reason}</p>
                      <div className="fleet-machine-facts">
                        <div>
                          <CalendarDays size={16} />
                          <span>
                            Próxima preventiva
                            <strong>
                              {m.nextDue
                                ? date(m.nextDue)
                                : "Previsão não disponível"}
                            </strong>
                          </span>
                        </div>
                        <div>
                          <FileText size={16} />
                          <span>
                            OSs em aberto
                            <strong>
                              {m.openOrders.length
                                ? m.openOrders
                                    .map((o: any) => "OS " + o.number)
                                    .join(" · ")
                                : "Nenhuma OS pendente"}
                            </strong>
                          </span>
                        </div>
                        {m.workshop && (
                          <div>
                            <Wrench size={16} />
                            <span>
                              Oficina<strong>{m.workshop.label}</strong>
                              <small>
                                Entrega prevista: {date(m.workshop.expectedAt)}
                              </small>
                            </span>
                          </div>
                        )}
                      </div>
                      <button
                        className="fleet-expand"
                        aria-expanded={expanded === m.id}
                        onClick={() =>
                          setExpanded(expanded === m.id ? "" : m.id)
                        }
                      >
                        Programações e manutenções <ChevronDown size={17} />
                      </button>
                      <div
                        className={
                          "fleet-machine-detail " +
                          (expanded === m.id ? "is-open" : "")
                        }
                      >
                        <h4>Programações</h4>
                        {m.operations
                          .filter((o: any) => !finalized(o))
                          .map((o: any) => (
                            <div className="fleet-history-row" key={o.id}>
                              <CalendarDays size={16} />
                              <div>
                                <strong>
                                  {o.description || "Atendimento programado"}
                                </strong>
                                <p>
                                  {date(o.date)} {o.time || ""} · OS{" "}
                                  {o.order_number}
                                </p>
                                <small>
                                  {o.status === "executing"
                                    ? "Em execução"
                                    : o.status === "awaiting_review"
                                      ? "Executado · aguardando revisão"
                                      : "Em programação"}
                                </small>
                              </div>
                            </div>
                          ))}
                        {!m.operations.some((o: any) => !finalized(o)) && (
                          <p>Nenhuma programação registrada.</p>
                        )}
                        <h4>Manutenções executadas</h4>
                        {m.operations.filter(finalized).map((o: any) => (
                          <div className="fleet-history-row" key={o.id}>
                            <CheckCircle2 size={16} />
                            <div>
                              <strong>
                                {o.description || "Manutenção realizada"}
                              </strong>
                              <p>
                                {date(o.ends_at || o.date)} · OS{" "}
                                {o.order_number}
                              </p>
                              {o.report ? (
                                <a
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  href={
                                    "/api/service-scheduling/checklist-pdf?mode=summary&operationId=" +
                                    o.id
                                  }
                                >
                                  <Printer size={15} />
                                  Relatório de manutenção (PDF)
                                </a>
                              ) : (
                                <small>Relatório técnico não disponível.</small>
                              )}
                            </div>
                          </div>
                        ))}
                        {!m.operations.some(finalized) && (
                          <p>Nenhuma manutenção revisada registrada.</p>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
                {!shown.length && (
                  <div className="fleet-empty">
                    <Factory size={30} />
                    <h3>Nenhuma máquina nesta seleção</h3>
                    <p>
                      Altere o farol ou a busca para consultar outros
                      equipamentos.
                    </p>
                  </div>
                )}
              </section>
              <aside className="fleet-agenda">
                <span className="fleet-eyebrow">PLANEJE-SE</span>
                <h2>
                  <CalendarDays size={21} />
                  Próximos cuidados
                </h2>
                <p>Programações e preventivas do parque completo.</p>
                {events.slice(0, 6).map((o) => (
                  <div className="fleet-agenda-item" key={o.id}>
                    <span className="fleet-agenda-date">
                      {date(o.date)} {o.time || ""}
                    </span>
                    <strong>{o.machine}</strong>
                    <p>
                      {o.description || "Atendimento"} · OS {o.order_number}
                    </p>
                  </div>
                ))}
                {!events.length && (
                  <p className="fleet-empty-note">
                    Nenhum atendimento com data programada.
                  </p>
                )}
                <h3>Preventivas previstas</h3>
                {machines
                  .filter((m) => m.nextDue)
                  .sort((a, b) => a.nextDue.localeCompare(b.nextDue))
                  .slice(0, 6)
                  .map((m) => (
                    <button
                      className="fleet-agenda-preventive"
                      key={m.id}
                      onClick={() => {
                        setQuery(m.id);
                        setFilter("all");
                        setExpanded(m.id);
                      }}
                    >
                      <span>{date(m.nextDue)}</span>
                      <strong>{m.name}</strong>
                      <ArrowUpRight size={16} />
                    </button>
                  ))}
                {!machines.some((m) => m.nextDue) && (
                  <p className="fleet-empty-note">
                    Previsões ainda não disponíveis.
                  </p>
                )}
                <div className="fleet-note">
                  <Activity size={19} />
                  <p>
                    Dados incompletos aparecem em cinza. “Em dia” indica
                    ausência de pendências nos registros disponíveis.
                  </p>
                </div>
              </aside>
            </div>
          </>
        )}
        {!loading && !data && !error && (
          <p>Nenhum cliente com máquinas vinculadas disponível.</p>
        )}
      </main>
    </div>
  );
}
