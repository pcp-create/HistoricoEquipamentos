"use client";
import { useEffect, useRef, useState } from "react";
import { Plus, Pencil, Archive, Save, Wrench, ArrowLeft } from "lucide-react";
import MaterialPhoto from "./material-photo";
import SiteHeader from "./site-header";
import {
  emptyOperating,
  estimateCurrentMeter,
  parsePlan,
  parseOperating,
  predict,
  brazilToday,
} from "@/lib/equipment-management/planning";
import { companyName } from "@/lib/company-names";
const api = async (url: string, options?: RequestInit) => {
  const r = await fetch("/api/equipment-management" + url, options);
  if (r.status === 401) {
    window.location.assign("/login");
    throw Error("Sessão expirada.");
  }
  const b = await r.json();
  if (!r.ok) throw Error(b.error || "Falha na operação.");
  return b;
};
const date = (v: string | null) =>
  !v
    ? "—"
    : v.length === 10
      ? v.split("-").reverse().join("/")
      : new Date(v).toLocaleDateString("pt-BR", {
          timeZone: "America/Sao_Paulo",
        });
const qty = (n: number | null) =>
  n == null ? "—" : n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const statuses: Record<string, string> = {
  overdue: "Vencida (estimativa)",
  due: "Limite atingido",
  soon: "Próximos 30 dias",
  incomplete: "Dados incompletos",
  scheduled: "Programada",
  none: "Sem plano",
};
const emptyPlan = {
  name: "",
  hours: "",
  months: "",
  lastDate: "",
  lastMeter: "",
  lastOrder: "",
  notes: "",
};
function Forecast({ value }: { value: any }) {
  return !value ? (
    <span className="muted">Sem plano</span>
  ) : (
    <>
      <span className={`equipment-status equipment-${value.status}`}>
        {statuses[value.status]}
      </span>
      <small>
        {value.due ? date(value.due) : "Preencha os dados do plano"}
      </small>
      {value.days != null && (
        <small>
          {value.days < 0
            ? `${Math.abs(value.days)} dias após a previsão`
            : value.days === 0
              ? "Hoje"
              : `Em ${value.days} dias`}
        </small>
      )}
      {value.incomplete && value.due && (
        <small>Previsão parcial: falta calcular outro limite</small>
      )}
    </>
  );
}
function EquipmentPhoto({ id, name }: { id: string; name: string }) {
  const container = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "100px" },
    );
    if (container.current) observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={container} className="equipment-photo-slot">
      {visible && (
        <MaterialPhoto id={id} name={name} companies={[1, 2, 27404]} compact />
      )}
    </div>
  );
}
function RentalBadge({ status }: { status: any }) {
  if (!status) return null;
  return (
    <span className="equipment-rental-context">
      <span
        className={`equipment-rental-state rental-${status.key}`}
        title={
          status.order
            ? `OS ${status.order} · ${companyName(status.company)} · Situação conforme última sincronização`
            : "Sem empenho ativo identificado na base sincronizada"
        }
      >
        {status.label}
      </span>
      {status.stockNote && (
        <span className="equipment-stock-note">· {status.stockNote}</span>
      )}
      {status.order && status.key !== "available" && (
        <span
          className="equipment-rental-customer"
          title={`Cliente da OS ${status.order}`}
        >
          · {status.customer || "Cliente não informado na OS"}
        </span>
      )}
      {status.contract && (
        <span className="equipment-contract">
          <span>
            Início: <b>{date(status.contract.start)}</b> · Fim:{" "}
            <b>{date(status.contract.end)}</b>
            {status.contract.duration != null &&
              ` · Vigência: ${status.contract.duration} dias`}
          </span>
          <span>
            <span
              className={`equipment-contract-status contract-${status.contract.key}`}
            >
              {status.contract.label}
            </span>
            {status.contract.remaining != null && (
              <span className={status.contract.remaining >= 0 && status.contract.remaining <= 5 ? "equipment-contract-urgent" : undefined}>
                {" "}
                ·{" "}
                {status.contract.remaining < 0
                  ? `Vencido há ${Math.abs(status.contract.remaining)} dias`
                  : status.contract.remaining === 0
                    ? "Vence hoje"
                    : `Faltam ${status.contract.remaining} dias`}
              </span>
            )}
          </span>
        </span>
      )}
    </span>
  );
}
function OrderLink({ id, company }: { id: string; company?: number }) {
  return (
    <a
      className="quote-order-link"
      target="_blank"
      rel="noopener noreferrer"
      href={
        "/?" +
        new URLSearchParams({
          view: "orders",
          orderNumber: id,
          ...(company ? { company: String(company) } : {}),
        })
      }
    >
      OS {id}
    </a>
  );
}
export default function EquipmentDashboard() {
  const [loaded, setResult] = useState<any>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [query, setQuery] = useState(""),
    [ownership, setOwnership] = useState(""),
    [equipmentTab, setEquipmentTab] = useState("all"),
    [rentalStatus, setRentalStatus] = useState(""),
    [contractStatus, setContractStatus] = useState(""),
    [contractType, setContractType] = useState("all"),
    [state, setState] = useState(""),
    [page, setPage] = useState(1),
    [refresh, setRefresh] = useState(0),
    [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(""),
    [detail, setDetail] = useState<any>(null),
    [detailLoading, setDetailLoading] = useState(false),
    [saving, setSaving] = useState(false);
  const [operating, setOperating] = useState<any>(emptyOperating),
    [plan, setPlan] = useState<any>(null),
    [planEdit, setPlanEdit] = useState<any>(null),
    [maintenance, setMaintenance] = useState<any>(null);
  let currentMeter: number | null = null;
  try {
    currentMeter = estimateCurrentMeter(
      parseOperating(operating),
      undefined,
      detail?.equipment?.usage,
    );
  } catch {}
  const rentalOnly = equipmentTab !== "all";
  const rentalRows = (loaded?.rows || []).filter((e: any) => e.rental);
  const rentalOptions = [
    ["", "Todos"],
    ["available", "Disponível"],
    ["unavailable", "Indisponível"],
    ["rented", "Locado"],
    ["loaned", "Emprestado"],
    ["reserved", "Reservado"],
    ["sold", "Vendido"],
  ].map(([key, label]) => ({
    key,
    label,
    count: rentalRows.filter((e: any) => !key || e.rentalStatus?.key === key)
      .length,
  }));
  const contractFilterVisible = equipmentTab === "status";
  const contractRows = rentalRows.filter((e: any) =>
    ["rented", "loaned"].includes(e.rentalStatus?.key),
  );
  const contractTypeOptions = [
    ["all", "Todos"],
    ["rented", "Locados"],
    ["loaned", "Emprestados"],
  ].map(([key, label]) => ({
    key, label,
    count: contractRows.filter((e: any) => key === "all" || e.rentalStatus.key === key).length,
  }));
  const typedContractRows = contractRows.filter((e: any) =>
    contractType === "all" || e.rentalStatus.key === contractType);
  const contractOptions = [
    ["all", "Todos"],
    ["current", "Dentro do prazo"],
    ["soon", "Próximo do vencimento"],
    ["overdue", "Vencido"],
    ["incomplete", "Conferir datas"],
  ].map(([key, label]) => ({
    key, label,
    count: typedContractRows.filter((e: any) =>
      key === "all" || (e.rentalStatus.contract?.key || "incomplete") === key).length,
  }));
  const filteredRows = (loaded?.rows || []).filter((e: any) => {
    if (equipmentTab === "all") return true;
    if (!e.rental) return false;
    if (equipmentTab === "rental")
      return !rentalStatus || e.rentalStatus?.key === rentalStatus;
    return ["rented", "loaned"].includes(e.rentalStatus?.key) &&
      (contractType === "all" || e.rentalStatus.key === contractType) &&
      (!contractStatus || contractStatus === "all" ||
        (e.rentalStatus.contract?.key || "incomplete") === contractStatus);
  });
  if (rentalOnly) {
    filteredRows.sort((a: any, b: any) => {
      const aDays = a.rentalStatus?.contract?.remaining;
      const bDays = b.rentalStatus?.contract?.remaining;
      if (aDays == null) return bDays == null ? 0 : 1;
      if (bDays == null) return -1;
      return aDays - bDays;
    });
  }
  const pages = Math.max(1, Math.ceil(filteredRows.length / 30));
  const currentPage = Math.min(page, pages);
  const result = loaded
    ? {
        ...loaded,
        rows: filteredRows.slice((currentPage - 1) * 30, currentPage * 30),
        page: currentPage,
        pages,
        total: filteredRows.length,
        counts: {
          equipment: filteredRows.length,
          overdue: filteredRows.filter((e: any) =>
            ["overdue", "due"].includes(e.forecast?.status),
          ).length,
          soon: filteredRows.filter((e: any) => e.forecast?.status === "soon")
            .length,
          unplanned: filteredRows.filter((e: any) => !e.plans).length,
        },
      }
    : null;
  const applyDetail = (d: any) => {
    setDetail(d);
    setOperating({ ...emptyOperating, ...d.settings.document });
  };
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(() => {
      api(
        "?" +
          new URLSearchParams({
            q: query,
            ownership,
            all: "1",
            state,
          }),
        { signal: controller.signal },
      )
        .then(setResult)
        .catch((e) => {
          if (!controller.signal.aborted) setError(e.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, ownership, state, refresh]);
  useEffect(() => {
    if (!selected) {
      setDetail(null);
      return;
    }
    const controller = new AbortController();
    setDetailLoading(true);
    setDetail(null);
    setPlan(null);
    setMaintenance(null);
    setError("");
    api("?id=" + selected, { signal: controller.signal })
      .then((d) => {
        if (!controller.signal.aborted) applyDetail(d);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setDetailLoading(false);
      });
    return () => controller.abort();
  }, [selected]);
  async function save(action: string, document: any, existing?: any) {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await api("", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          equipment: selected,
          action,
          document,
          id: existing?.id || null,
          version:
            action === "settings"
              ? detail.settings.version
              : (existing?.version ?? null),
        }),
      });
      const d = await api("?id=" + selected);
      applyDetail(d);
      setPlan(null);
      setMaintenance(null);
      setRefresh((n) => n + 1);
      setMessage(
        action === "maintenance"
          ? "Manutenção registrada. Previsão do plano atualizada."
          : "Informações salvas.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  let preview: any = null;
  if (plan) {
    try {
      preview = predict(
        parsePlan(plan),
        parseOperating(operating),
        undefined,
        detail?.equipment?.usage,
      );
    } catch {}
  }
  return (
    <>
      <SiteHeader active="equipment" email={result?.email} />
      <main className="equipment-page catalog-settings">
        <section className="manual-card">
          <h1>Equipamentos</h1>
          <p>
            Clientes, histórico de OS e planejamento de preventivas dos
            equipamentos cadastrados.
          </p>
          <div className="equipment-counters">
            {[
              ["Equipamentos", result?.counts.equipment],
              ["Vencidas / limite atingido", result?.counts.overdue],
              ["Próximos 30 dias", result?.counts.soon],
              ["Sem plano", result?.counts.unplanned],
            ].map(([label, value]) => (
              <div key={label}>
                <small>{label}</small>
                <strong>{value ?? "—"}</strong>
              </div>
            ))}
          </div>
        </section>
        {error && (
          <p role="alert" className="catalog-settings-error">
            {error}
          </p>
        )}
        {message && <p role="status">{message}</p>}
        {!selected ? (
          <section className="manual-card">
            <nav
              className="equipment-view-tabs"
              aria-label="Visão dos equipamentos"
            >
              {[
                ["all", "Todos"],
                ["rental", "Máquinas de Locação"],
                ["status", "Locados e Emprestados"],
              ].map(([key, label]) => (
                <button
                  type="button"
                  key={key}
                  aria-pressed={equipmentTab === key}
                  onClick={() => {
                    setEquipmentTab(key);
                    setContractType("all");
                    setRentalStatus("");
                    setContractStatus("");
                    setPage(1);
                  }}
                >
                  {label} (
                  {loaded
                    ? key === "all"
                      ? loaded.rows.length
                      : key === "rental"
                        ? rentalRows.length
                        : contractRows.length
                    : "—"}
                  )
                </button>
              ))}
            </nav>
            {equipmentTab === "rental" && (
              <div
                className="equipment-rental-status-filters"
                role="group"
                aria-label="Status das máquinas de locação"
              >
                {rentalOptions.map(({ key, label, count }) => (
                  <button
                    key={key}
                    className={`rental-filter-${key || "all"}`}
                    type="button"
                    aria-pressed={rentalStatus === key}
                    onClick={() => {
                      setRentalStatus(key);
                      setContractStatus("");
                      setPage(1);
                    }}
                  >
                    {label} <strong>{count}</strong>
                  </button>
                ))}
                <small>Quantidades conforme os demais filtros da lista.</small>
              </div>
            )}
            {contractFilterVisible && (
              <div className="equipment-contract-filter-row">
              <div className="equipment-rental-status-filters equipment-contract-filter-group"
                role="group" aria-label="Tipo de contrato">
                <small>Tipo</small>
                {contractTypeOptions.map(({ key, label, count }) => (
                  <button type="button" key={key}
                    className={`rental-filter-${key}`}
                    aria-pressed={contractType === key}
                    onClick={() => { setContractType(key); setPage(1); }}>
                    {label} <strong>{count}</strong>
                  </button>
                ))}
              </div>
              <div
                className="equipment-rental-status-filters equipment-contract-filters equipment-contract-filter-group"
                role="group"
                aria-label="Situação do contrato de locação ou empréstimo"
              >
                <small>Prazo do contrato</small>
                {contractOptions.map(({ key, label, count }) => (
                  <button
                    type="button"
                    key={key}
                    className={`contract-filter-${key}`}
                    aria-pressed={contractStatus === key || (!contractStatus && key === "all")}
                    onClick={() => {
                      setContractStatus(key);
                      setPage(1);
                    }}
                  >
                    {label} <strong>{count}</strong>
                  </button>
                ))}
              </div>
              </div>
            )}
            <div className="equipment-filters">
              <label>
                Pesquisar equipamento ou cliente
                <input
                  value={query}
                  placeholder="Nome, modelo, série, cliente ou código"
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setPage(1);
                  }}
                />
              </label>
              <label>
                Classificação
                <select
                  value={ownership}
                  onChange={(e) => {
                    setOwnership(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">Todas</option>
                  <option value="own">Equipamentos próprios</option>
                  <option value="customer">Equipamentos de clientes</option>
                  <option value="unknown">Não classificado</option>
                </select>
              </label>
              <label>
                Preventivas
                <select
                  value={state}
                  onChange={(e) => {
                    setState(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">Todas as situações</option>
                  {Object.entries(statuses).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {loading && <p role="status">Consultando equipamentos…</p>}
            <div className="equipment-table">
              <table>
                <thead>
                  <tr>
                    <th>Equipamento / modelo</th>
                    <th>Número de série</th>
                    <th>Cliente atribuído</th>
                    <th>Última OS vinculada</th>
                    <th>Preventiva prioritária</th>
                    <th>Situação</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {result?.rows.map((e: any) => (
                    <tr key={e.id}>
                      <td>
                        <div className="equipment-identity">
                          {rentalOnly && (
                            <EquipmentPhoto id={e.id} name={e.name} />
                          )}
                          <div>
                            <strong>{e.name}</strong>
                            <small>
                              {e.brand || "Marca não informada"} ·{" "}
                              {e.model || "Modelo não informado"} · Cód. {e.id}
                              {e.rental && e.internal_code && (
                                <span> · ID interno: {e.internal_code}</span>
                              )}
                            </small>
                            <small
                              className={
                                e.rental ? "equipment-rental-tag" : undefined
                              }
                            >
                              {e.rental
                                ? "Máquina própria de locação"
                                : e.ownership === "own"
                                  ? "Equipamento próprio"
                                  : e.ownership === "customer"
                                    ? "Equipamento de cliente"
                                    : "Classificação pendente"}
                            </small>
                          </div>
                        </div>
                      </td>
                      <td>{e.serial || "Não informada"}</td>
                      <td>
                        {e.clients.length
                          ? e.clients.map((c: any) => (
                              <small key={c.id}>
                                {c.name || `Cliente ${c.id}`}
                              </small>
                            ))
                          : "Sem vínculo no cadastro"}
                      </td>
                      <td>
                        {e.latest ? (
                          <>
                            <OrderLink
                              id={e.latest.order_id}
                              company={e.latest.company_id}
                            />
                            <small>{date(e.latest.date)}</small>
                            <small>{e.latest.tipo_nome}</small>
                            <small>{e.latest.status}</small>
                          </>
                        ) : (
                          "Sem OS vinculada"
                        )}
                      </td>
                      <td>
                        <Forecast value={e.forecast} />
                      </td>
                      <td className="equipment-situation-cell">
                        {e.rental ? (
                          <RentalBadge status={e.rentalStatus} />
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        <button
                          className="catalog-edit-button"
                          onClick={() => {
                            setSelected(e.id);
                            setMessage("");
                          }}
                        >
                          <Wrench size={14} /> Gerenciar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!loading && result?.total === 0 && (
              <p>Nenhum equipamento encontrado.</p>
            )}
            <div className="equipment-pager">
              <button
                disabled={loading || !result || result.page <= 1}
                onClick={() => setPage(result.page - 1)}
              >
                Anterior
              </button>
              <span>
                Página {result?.page || 1} de {result?.pages || 1} ·{" "}
                {result?.total || 0} equipamentos
              </span>
              <button
                disabled={loading || !result || result.page >= result.pages}
                onClick={() => setPage(result.page + 1)}
              >
                Próxima
              </button>
            </div>
          </section>
        ) : (
          <>
            <button
              className="equipment-back"
              disabled={saving}
              onClick={() => setSelected("")}
            >
              <ArrowLeft size={16} /> Voltar aos equipamentos
            </button>
            {detailLoading && <p role="status">Carregando equipamento…</p>}
            {detail && (
              <>
                <section className="manual-card">
                  <h2>{detail.equipment.name}</h2>
                  {detail.equipment.rental && (
                    <span className="equipment-rental-badge">
                      Máquina de locação · Família 3 no M8
                    </span>
                  )}
                  {detail.equipment.rental && (
                    <RentalBadge status={detail.equipment.rentalStatus} />
                  )}
                  <p>
                    {detail.equipment.brand || "Marca não informada"} · Modelo:{" "}
                    {detail.equipment.model || "Não informado"} · Série:{" "}
                    {detail.equipment.serial || "Não informada"}
                  </p>
                  <p>
                    <b>Cliente atribuído:</b>{" "}
                    {detail.clients
                      .map((c: any) => c.name || c.id)
                      .join(" · ") || "Sem vínculo no cadastro M8"}
                  </p>
                  <small className="muted">
                    Cadastro coletado em {date(detail.equipment.collected_at)}.
                    Vínculos de clientes são mantidos pelo M8; a classificação
                    abaixo é interna.
                  </small>
                  <p>
                    <a
                      className="quote-order-link"
                      href={
                        "/fabricante?" +
                        new URLSearchParams({
                          model: detail.equipment.model || "",
                          serial: detail.equipment.serial || "",
                        })
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Consultar catálogo do fabricante
                    </a>
                  </p>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      save("settings", operating);
                    }}
                  >
                    <fieldset disabled={saving}>
                      <legend>Operação e leitura do equipamento</legend>
                      <div className="equipment-form-grid">
                        <label>
                          Classificação
                          <select
                            value={operating.ownership}
                            disabled={detail.equipment.rental}
                            onChange={(e) =>
                              setOperating({
                                ...operating,
                                ownership: e.target.value,
                              })
                            }
                          >
                            <option value="unknown">Não classificado</option>
                            <option value="customer">
                              Equipamento de cliente
                            </option>
                            <option value="own">Equipamento próprio</option>
                          </select>
                        </label>
                        <label>
                          Horas de operação por dia
                          <input
                            type="number"
                            min="0.001"
                            max="24"
                            step="0.001"
                            value={operating.hoursDay ?? ""}
                            onChange={(e) =>
                              setOperating({
                                ...operating,
                                hoursDay: e.target.value,
                              })
                            }
                            placeholder="Ex.: 24"
                          />
                        </label>
                        <label>
                          Dias de operação por ano
                          <input
                            type="number"
                            min="1"
                            max="365"
                            value={operating.daysYear ?? ""}
                            onChange={(e) =>
                              setOperating({
                                ...operating,
                                daysYear: e.target.value,
                              })
                            }
                            placeholder="Ex.: 365"
                          />
                        </label>
                        <label>
                          Última leitura real do horímetro
                          <input
                            type="number"
                            min="0"
                            step="0.001"
                            max="100000000"
                            value={operating.meter ?? ""}
                            onChange={(e) =>
                              setOperating({
                                ...operating,
                                meter: e.target.value,
                              })
                            }
                          />
                        </label>
                        <label>
                          Data da leitura
                          <input
                            type="date"
                            max={brazilToday()}
                            value={operating.meterDate}
                            onChange={(e) =>
                              setOperating({
                                ...operating,
                                meterDate: e.target.value,
                              })
                            }
                          />
                        </label>
                        <label className="equipment-wide">
                          Observações da operação
                          <textarea
                            rows={2}
                            maxLength={3000}
                            value={operating.notes}
                            onChange={(e) =>
                              setOperating({
                                ...operating,
                                notes: e.target.value,
                              })
                            }
                          />
                        </label>
                      </div>
                      <div
                        className="equipment-meter-estimate"
                        aria-live="polite"
                      >
                        <span>Horímetro atual estimado</span>
                        <strong>
                          {currentMeter == null
                            ? "—"
                            : `${currentMeter.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`}
                        </strong>
                        <small>
                          {currentMeter == null
                            ? "Informe uma leitura válida, sua data e a rotina de operação para calcular."
                            : `Estimativa para ${date(brazilToday())}, com base nos campos acima. Não substitui uma leitura real.`}
                        </small>
                      </div>
                      {detail.equipment.rental && (
                        <p className="muted">
                          Conta somente períodos de locação ou empréstimo: da
                          abertura da OS até a entrega prevista quando
                          processada com o equipamento não aprovado. Intervalos
                          parados não acrescentam horas.{" "}
                          {detail.equipment.usage?.incomplete &&
                            "Há períodos sem datas válidas; confira as OSs para calcular a estimativa."}
                        </p>
                      )}
                      <p className="muted">
                        A previsão distribui as horas anuais ao longo de 365
                        dias. Não considera feriados, paradas ou escalas
                        específicas. Sem regime informado, o vencimento por
                        horas exige uma leitura que já tenha atingido o limite.
                      </p>
                      <div className="catalog-editor-actions">
                        <button className="catalog-save-button">
                          <Save size={15} /> Salvar operação
                        </button>
                      </div>
                    </fieldset>
                  </form>
                </section>
                <section className="manual-card">
                  <div className="equipment-heading">
                    <h2>Plano de preventivas</h2>
                    <button
                      disabled={saving}
                      className="catalog-edit-button"
                      onClick={() => {
                        setPlan({ ...emptyPlan });
                        setPlanEdit(null);
                        setMaintenance(null);
                      }}
                    >
                      <Plus size={15} /> Criar plano
                    </button>
                  </div>
                  <p className="muted">
                    Com horas e meses preenchidos, vale o limite que chegar
                    primeiro. Registre cada serviço separadamente; uma OS no
                    histórico não reinicia automaticamente o plano.
                  </p>
                  <div className="equipment-table">
                    <table>
                      <thead>
                        <tr>
                          <th>Serviço</th>
                          <th>Intervalos</th>
                          <th>Última intervenção</th>
                          <th>Horímetro alvo</th>
                          <th>Próxima preventiva</th>
                          <th>Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.plans.map((p: any) => (
                          <tr key={p.id}>
                            <td>
                              <strong>{p.document.name}</strong>
                              <small>{p.document.notes}</small>
                            </td>
                            <td>
                              {p.document.hours
                                ? `${qty(p.document.hours)} h`
                                : "—"}
                              <small>
                                {p.document.months
                                  ? `${p.document.months} meses`
                                  : "Sem prazo em meses"}
                              </small>
                            </td>
                            <td>
                              {date(p.document.lastDate)}
                              <small>
                                Horímetro: {qty(p.document.lastMeter)} h
                              </small>
                              {p.document.lastOrder && (
                                <OrderLink id={p.document.lastOrder} />
                              )}
                            </td>
                            <td>
                              {qty(p.forecast.target)} h
                              <small>
                                Estimado hoje: {qty(p.forecast.estimatedMeter)}{" "}
                                h
                              </small>
                            </td>
                            <td>
                              <Forecast value={p.forecast} />
                              {p.forecast.monthDate && (
                                <small>
                                  Por meses: {date(p.forecast.monthDate)}
                                </small>
                              )}
                              {p.forecast.hoursDate && (
                                <small>
                                  Por horas: {date(p.forecast.hoursDate)}
                                </small>
                              )}
                            </td>
                            <td>
                              <div className="equipment-actions">
                                <button
                                  disabled={saving}
                                  title="Editar plano"
                                  aria-label={`Editar ${p.document.name}`}
                                  onClick={() => {
                                    setPlan({ ...p.document });
                                    setPlanEdit(p);
                                    setMaintenance(null);
                                  }}
                                >
                                  <Pencil size={15} />
                                </button>
                                <button
                                  disabled={saving}
                                  title="Registrar manutenção realizada"
                                  aria-label={`Registrar manutenção de ${p.document.name}`}
                                  onClick={() => {
                                    setMaintenance({
                                      plan: p,
                                      date: brazilToday(),
                                      meter: "",
                                      order: "",
                                      notes: "",
                                    });
                                    setPlan(null);
                                  }}
                                >
                                  <Wrench size={15} />
                                </button>
                                <button
                                  disabled={saving}
                                  title="Arquivar plano"
                                  aria-label={`Arquivar ${p.document.name}`}
                                  onClick={() => save("archive", {}, p)}
                                >
                                  <Archive size={15} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {!detail.plans.length && (
                    <p>
                      Nenhum plano cadastrado. Crie o primeiro plano para
                      calcular a próxima preventiva.
                    </p>
                  )}
                  {plan && (
                    <form
                      className="equipment-editor"
                      onSubmit={(e) => {
                        e.preventDefault();
                        save("plan", plan, planEdit);
                      }}
                    >
                      <fieldset disabled={saving}>
                        <legend>
                          {planEdit
                            ? "Editar plano"
                            : "Novo plano de preventiva"}
                        </legend>
                        <div className="equipment-form-grid">
                          <label className="equipment-wide">
                            Serviço / nome do plano
                            <input
                              required
                              maxLength={160}
                              value={plan.name}
                              placeholder="Ex.: Preventiva 4.000 horas"
                              onChange={(e) =>
                                setPlan({ ...plan, name: e.target.value })
                              }
                            />
                          </label>
                          <label>
                            Intervalo em horas
                            <input
                              type="number"
                              min="0.001"
                              max="1000000"
                              step="0.001"
                              value={plan.hours ?? ""}
                              onChange={(e) =>
                                setPlan({ ...plan, hours: e.target.value })
                              }
                            />
                          </label>
                          <label>
                            Intervalo em meses
                            <input
                              type="number"
                              min="1"
                              max="1200"
                              value={plan.months ?? ""}
                              onChange={(e) =>
                                setPlan({ ...plan, months: e.target.value })
                              }
                            />
                          </label>
                          <label>
                            Data da última intervenção
                            <input
                              type="date"
                              max={brazilToday()}
                              value={plan.lastDate}
                              onChange={(e) =>
                                setPlan({ ...plan, lastDate: e.target.value })
                              }
                            />
                          </label>
                          <label>
                            Horímetro na última intervenção
                            <input
                              type="number"
                              min="0"
                              max="100000000"
                              step="0.001"
                              value={plan.lastMeter ?? ""}
                              onChange={(e) =>
                                setPlan({ ...plan, lastMeter: e.target.value })
                              }
                            />
                          </label>
                          <label>
                            Última OS vinculada (opcional)
                            <input
                              inputMode="numeric"
                              maxLength={18}
                              value={plan.lastOrder}
                              onChange={(e) =>
                                setPlan({ ...plan, lastOrder: e.target.value })
                              }
                            />
                          </label>
                          <label className="equipment-wide">
                            Peças, serviços e condições do plano
                            <textarea
                              rows={3}
                              maxLength={3000}
                              value={plan.notes}
                              onChange={(e) =>
                                setPlan({ ...plan, notes: e.target.value })
                              }
                            />
                          </label>
                        </div>
                        <p className="muted">
                          Intervalos são contados desde a última intervenção
                          deste plano. Pode salvar sem a data ou leitura
                          inicial, mas a previsão ficará incompleta. Se este for
                          o primeiro serviço, informe a data e leitura de início
                          de operação como referência.
                        </p>
                        {preview && (
                          <div className="equipment-preview">
                            <b>Prévia com os dados preenchidos</b>
                            <Forecast value={preview} />
                            <small>
                              Salve a operação acima para usar esse regime no
                              cálculo definitivo.
                            </small>
                          </div>
                        )}
                        <div className="catalog-editor-actions">
                          <button className="catalog-save-button">
                            <Save size={15} /> Salvar plano
                          </button>
                          <button
                            type="button"
                            className="catalog-cancel-button"
                            onClick={() => setPlan(null)}
                          >
                            Cancelar
                          </button>
                        </div>
                      </fieldset>
                    </form>
                  )}
                  {maintenance && (
                    <form
                      className="equipment-editor"
                      onSubmit={(e) => {
                        e.preventDefault();
                        save(
                          "maintenance",
                          {
                            date: maintenance.date,
                            meter: maintenance.meter,
                            order: maintenance.order,
                            notes: maintenance.notes,
                          },
                          maintenance.plan,
                        );
                      }}
                    >
                      <fieldset disabled={saving}>
                        <legend>
                          Manutenção realizada ·{" "}
                          {maintenance.plan.document.name}
                        </legend>
                        <div className="equipment-form-grid">
                          <label>
                            Data da intervenção
                            <input
                              required
                              type="date"
                              max={brazilToday()}
                              value={maintenance.date}
                              onChange={(e) =>
                                setMaintenance({
                                  ...maintenance,
                                  date: e.target.value,
                                })
                              }
                            />
                          </label>
                          <label>
                            Horímetro da intervenção
                            <input
                              required={!!maintenance.plan.document.hours}
                              type="number"
                              min="0"
                              step="0.001"
                              max="100000000"
                              value={maintenance.meter}
                              onChange={(e) =>
                                setMaintenance({
                                  ...maintenance,
                                  meter: e.target.value,
                                })
                              }
                            />
                          </label>
                          <label>
                            OS vinculada (opcional)
                            <input
                              inputMode="numeric"
                              value={maintenance.order}
                              maxLength={18}
                              onChange={(e) =>
                                setMaintenance({
                                  ...maintenance,
                                  order: e.target.value,
                                })
                              }
                            />
                          </label>
                          <label className="equipment-wide">
                            Observações
                            <textarea
                              rows={3}
                              maxLength={3000}
                              value={maintenance.notes}
                              onChange={(e) =>
                                setMaintenance({
                                  ...maintenance,
                                  notes: e.target.value,
                                })
                              }
                            />
                          </label>
                        </div>
                        <p className="muted">
                          Reinicia somente este plano a partir da data e leitura
                          informadas. Os demais planos permanecem com suas
                          próprias intervenções.
                        </p>
                        <div className="catalog-editor-actions">
                          <button className="catalog-save-button">
                            <Wrench size={15} /> Registrar manutenção
                          </button>
                          <button
                            type="button"
                            className="catalog-cancel-button"
                            onClick={() => setMaintenance(null)}
                          >
                            Cancelar
                          </button>
                        </div>
                      </fieldset>
                    </form>
                  )}
                </section>
                <section className="manual-card">
                  <h2>Últimas OS do equipamento</h2>
                  <p className="muted">
                    Até 30 OS das três empresas. Vínculos por observações são
                    identificados; associações pendentes de revisão não entram
                    nesta lista.
                  </p>
                  <div className="equipment-table">
                    <table>
                      <thead>
                        <tr>
                          <th>OS</th>
                          <th>Data</th>
                          <th>Cliente</th>
                          <th>Tipo / situação</th>
                          <th>Origem do vínculo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.history.map((o: any) => (
                          <tr key={`${o.company_id}:${o.id}`}>
                            <td>
                              <OrderLink id={o.id} company={o.company_id} />
                              <small>{companyName(o.company_id)}</small>
                            </td>
                            <td>{date(o.date)}</td>
                            <td>{o.cliente_nome || "—"}</td>
                            <td>
                              {o.tipo_nome || "Não informado"}
                              <small>{o.status}</small>
                            </td>
                            <td>
                              {o.method === "observation"
                                ? "Identificado nas observações"
                                : o.method === "serial"
                                  ? "Número de série"
                                  : "Equipamento atribuído na OS"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {!detail.history.length && (
                    <p>Nenhuma OS vinculada encontrada.</p>
                  )}
                </section>
                <section className="manual-card">
                  <h2>Registros de preventiva</h2>
                  <p className="muted">
                    Últimos 50 registros e alterações, com identificação de quem
                    preencheu.
                  </p>
                  {detail.events.length ? (
                    <div className="equipment-table">
                      <table>
                        <thead>
                          <tr>
                            <th>Registro</th>
                            <th>Informações</th>
                            <th>Responsável</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detail.events.map((e: any) => (
                            <tr key={e.id}>
                              <td>
                                {{
                                  settings: "Operação atualizada",
                                  plan: "Plano salvo",
                                  maintenance: "Manutenção realizada",
                                  archive: "Plano arquivado",
                                }[e.kind as string] || e.kind}
                                <small>{date(e.created_at)}</small>
                              </td>
                              <td>
                                {e.document.after?.name ||
                                  "Configuração do equipamento"}
                                {e.document.intervention && (
                                  <>
                                    <small>
                                      Intervenção:{" "}
                                      {date(e.document.intervention.date)} ·{" "}
                                      {qty(e.document.intervention.meter)} h
                                    </small>
                                    <small>
                                      {e.document.intervention.notes}
                                    </small>
                                  </>
                                )}
                              </td>
                              <td>
                                {e.display_name}
                                <small>{e.created_by}</small>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p>Nenhum registro manual ainda.</p>
                  )}
                </section>
              </>
            )}
          </>
        )}
      </main>
    </>
  );
}
