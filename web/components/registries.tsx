"use client";
import { useEffect, useState, useRef } from "react";
import {
  Database,
  RefreshCw,
  ChevronRight,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Pencil,
} from "lucide-react";
import Link from "next/link";
import SiteHeader from "./site-header";
import type { OrderType } from "@/lib/order-type-model";
import "./registries.css";
import ServiceOrderRegistryEditor from "./service-order-registry-editor";
type Row = OrderType & {
  collected_at: string;
  warranty_id?: number;
  warranty_description?: string;
};
const registries = [
  {
    id: "order-types",
    title: "Tipo Ordens de Serviço",
    updated: "tipos de OS",
  },
  {
    id: "quote-types",
    title: "Tipos de Orçamento",
    updated: "tipos de orçamento",
  },
  {
    id: "payment-terms",
    title: "Condições de Pagamento",
    updated: "condições",
  },
  {
    id: "order-statuses",
    title: "Situação Ordem de Serviço",
    updated: "situações",
  },
  { id: "flow-statuses", title: "Status Fluxo", updated: "status de fluxo" },
  { id: "freight", title: "Fretes", updated: "fretes" },
  {
    id: "service-types",
    title: "Tipo Atendimento",
    updated: "tipos de atendimento",
  },
  { id: "service-origins", title: "Origem Atendimento", updated: "origens" },
];
const manual = (id: string | null) =>
  id === "service-types" || id === "service-origins" || id === "order-statuses";
export default function Registries() {
  const requestId = useRef(0);
  const [editing, setEditing] = useState<Row | null>(null);
  const [updated, setUpdated] = useState<string | null>(null);
  const [opened, setOpened] = useState<string | null>(null),
    [rows, setRows] = useState<Row[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState("all");
  const selected = registries.find((r) => r.id === opened);
  function select(id: string | null) {
    requestId.current++;
    setOpened(id);
    setEditing(null);
    setRows([]);
    setUpdated(null);
    setSearch("");
    setStatus("all");
    setError("");
    setMessage("");
  }
  async function load(refresh = false) {
    if (!selected) return;
    const current = ++requestId.current;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/registries/" + selected.id, {
        method: refresh ? "POST" : "GET",
        cache: "no-store",
      });
      const data = await response.json();
      if (current !== requestId.current) return;
      if (!response.ok) throw new Error(data.error);
      setRows(data.rows);
      setUpdated(data.lastManualUpdate ?? null);
      if (refresh)
        setMessage(data.count + " " + selected.updated + " atualizados.");
    } catch (e) {
      if (current === requestId.current)
        setError(
          e instanceof Error
            ? e.message
            : "Não foi possível carregar o cadastro.",
        );
    } finally {
      if (current === requestId.current) setBusy(false);
    }
  }
  useEffect(() => {
    if (opened) void load();
  }, [opened]);
  const normalize = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const filtered = rows.filter(
    (r) =>
      normalize(r.id + " " + r.name).includes(normalize(search)) &&
      (status === "all" || r.active === (status === "active")),
  );
  return (
    <>
      <SiteHeader active="registries" />
      <main className="registry-main">
        <h1>Cadastros</h1>
        <p>
          Listas utilizadas no sistema, integradas ao M8 ou cadastradas
          manualmente.
        </p>
        {!opened ? (
          <div className="registry-grid">
            {registries.map((registry) => (
              <button
                key={registry.id}
                className="registry-card"
                onClick={() => select(registry.id)}
              >
                <Database size={26} />
                <span>
                  <strong>{registry.title}</strong>
                  <small>
                    {manual(registry.id)
                      ? "Cadastro manual"
                      : "M8 · Atualização manual"}
                  </small>
                </span>
                <ChevronRight />
              </button>
            ))}
            <Link
              className="registry-card"
              style={{ textDecoration: "none" }}
              href="/configuracoes/cadastros/divisao-comercial"
            >
              <Database size={26} />
              <span>
                <strong>Divisão Comercial</strong>
                <small>
                  Cadastro manual · Cidades, vendedores e orçamentistas
                </small>
              </span>
              <ChevronRight />
            </Link>
          </div>
        ) : (
          <>
            <button className="registry-button" onClick={() => select(null)}>
              <ArrowLeft size={16} /> Todos os cadastros
            </button>
            <section className="registry-panel">
              <header>
                <div>
                  <h2>{selected?.title}</h2>
                  <p>
                    {manual(opened)
                      ? "Cadastro manual · IDs correspondentes ao M8"
                      : "Origem: M8 · Armazenado no sistema · Atualização manual"}
                  </p>
                </div>
                {!manual(opened) && (
                  <button
                    className="registry-button primary"
                    disabled={busy}
                    onClick={() => void load(true)}
                  >
                    <RefreshCw size={16} />
                    {busy ? "Carregando…" : "Atualizar do M8"}
                  </button>
                )}
              </header>
              <div className="registry-filters">
                <label>
                  Pesquisar por ID ou nome
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Digite o ID ou nome"
                  />
                </label>
                <label>
                  Ativo
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                  >
                    <option value="all">Todos</option>
                    <option value="active">Sim</option>
                    <option value="inactive">Não</option>
                  </select>
                </label>
              </div>
              {error && (
                <p role="alert" className="registry-error">
                  {error}{" "}
                  <button
                    className="registry-button"
                    disabled={busy}
                    onClick={() => void load()}
                  >
                    Tentar novamente
                  </button>
                </p>
              )}
              {message && <p role="status">{message}</p>}
              <p className="registry-meta">
                {filtered.length} registro(s) · Última atualização manual:{" "}
                {updated
                  ? new Date(updated).toLocaleString("pt-BR", {
                      timeZone: "America/Sao_Paulo",
                    })
                  : "ainda não realizada"}
              </p>
              <div className="registry-table">
                <table>
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Nome</th>
                      <th>Ativo</th>
                      {opened === "order-types" && (
                        <th>Buscar equipamento por cliente</th>
                      )}
                      {opened === "service-types" && (
                        <>
                          <th>ID Prazo Garantia</th>
                          <th>Prazo Garantia</th>
                          <th>Ações</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r) => (
                      <tr key={r.id}>
                        <td>{r.id}</td>
                        <td>{r.name}</td>
                        <td>
                          <span
                            className={
                              r.active ? "registry-active" : "registry-inactive"
                            }
                          >
                            {r.active ? (
                              <CheckCircle2 size={16} />
                            ) : (
                              <XCircle size={16} />
                            )}{" "}
                            {r.active ? "Sim" : "Não"}
                          </span>
                        </td>
                        {opened === "order-types" && (
                          <td>
                            {r.customer_equipment_only == null
                              ? "Atualize do M8"
                              : r.customer_equipment_only
                                ? "Sim"
                                : "Não"}
                          </td>
                        )}
                        {opened === "service-types" && (
                          <>
                            <td>{r.warranty_id}</td>
                            <td>{r.warranty_description}</td>
                            <td>
                              <button
                                type="button"
                                className="registry-button"
                                onClick={() => setEditing({ ...r })}
                                aria-label={`Editar ${r.name}`}
                              >
                                <Pencil size={16} /> Editar
                              </button>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!busy && !filtered.length && (
                <p>
                  {rows.length
                    ? "Nenhum tipo corresponde aos filtros."
                    : "Nenhum tipo cadastrado. Cadastre abaixo ou atualize do M8 para importar."}
                </p>
              )}
              {manual(opened) && (
                <ServiceOrderRegistryEditor
                  key={opened}
                  kind={opened!}
                  rows={rows}
                  editing={editing}
                  onSaved={() => {
                    setEditing(null);
                    void load();
                  }}
                />
              )}
            </section>
          </>
        )}
      </main>
    </>
  );
}
