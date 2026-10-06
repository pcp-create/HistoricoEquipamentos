"use client";
import { rentalSpecifications, rentalSpecificationRanges, matchesRentalSpecification, type RentalSpecification } from "@/lib/equipment-management/rental-specifications";
import CopyPreventivePlan from "./copy-preventive-plan";
import EquipmentDetailsDrawer from "./equipment-details-drawer";
import OrderDetailLink from "./order-detail-link";
import CreateLinkedTask from "./create-linked-task";
import { apiFetch, cachedEquipmentList } from "@/lib/client-api-cache";
import { fold } from "@/lib/filters";
import { Fragment, useEffect, useRef, useState } from "react";
import {
  Settings2,
  Wind,
  Gauge,
  Plus,
  Pencil,
  Archive,
  Save,
  Wrench,
  ArrowLeft,
  Eye,
  ChevronDown,
} from "lucide-react";
import PreventivePlanItems from "./preventive-plan-items";
import PreventivePlanQuote from "./preventive-plan-quote";
import { OrderDetails } from "./dashboard";
import MaterialPhoto from "./material-photo";
import { EquipmentTaskProvider, EquipmentTaskLinks } from "./tasks-dashboard";
import SiteHeader from "./site-header";
import { useSessionAccess } from "./session-access";
import {
  emptyOperating,
  estimateCurrentMeter,
  parsePlan,
  parseOperating,
  predict,
  brazilToday,
} from "@/lib/equipment-management/planning.stable";
import { companyName } from "@/lib/company-names";
const api = async (url: string, options?: RequestInit) => {
  const r = await apiFetch("/api/equipment-management" + url, options);
  if (r.status === 401) {
    window.location.assign(
      "/login?next=" +
        encodeURIComponent(window.location.pathname + window.location.search),
    );
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
  if (value?.coveredBy) return <><span className="equipment-status">Incluída em {value.coveredBy.name}</span><small>Tratativa única pela revisão maior. O histórico deste plano é preservado.</small></>;
  return !value ? (
    <span className="muted">Sem plano</span>
  ) : (
    <>
      <span className={`equipment-status equipment-${value.status}`}>
        {value.neverPerformed && value.incomplete && value.hoursDate ? "Previsão por horas" : statuses[value.status]}
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
      {value.neverPerformed && value.missingMonthReference && <small>Prazo por meses sem referência: informe a data de início de operação.</small>}
      {value.incomplete && value.due && !value.neverPerformed && (
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
              <span
                className={
                  status.contract.remaining >= 0 &&
                  status.contract.remaining <= 5
                    ? "equipment-contract-urgent"
                    : undefined
                }
              >
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
function OrderLink({id,company,equipment}:{id:string;company?:number;equipment?:string}){
  return <OrderDetailLink id={String(id)} company={company} equipment={equipment}/>;
}
export default function EquipmentDashboard() {
  const { admin } = useSessionAccess();
  const [previewEquipment, setPreviewEquipment] = useState("");
  const [equipmentView, setEquipmentView] = useState("list");
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set());
  const [loaded, setResult] = useState<any>(null),
    [error, setError] = useState(""),
    [saveError, setSaveError] = useState(""),
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
  const [orderSelection, setOrderSelection] = useState<{
    company_id: number;
    id: string;
    number: string;
  } | null>(null);
  const [quotePlan, setQuotePlan] = useState<any>(null);
  const initialPlan = useRef("");
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (/^[1-9]\d{0,17}$/.test(params.get("equipment") || "")) {
      initialPlan.current = params.get("plan") || "";
      setSelected(params.get("equipment")!);
    }
  }, []);
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
  const [specFilters, setSpecFilters] = useState({hp:"",pcm:"",pressure:""});
  const specificationFields: [RentalSpecification,string][] = [["hp","Potência (HP)"],["pcm","Vazão (PCM)"],["pressure","Pressão"]];
  const specificationRows = (loaded?.rows || []).filter((e:any) => e.rental && (equipmentTab !== "status" || ["rented","loaned"].includes(e.rentalStatus?.key)));
  const specificationOptions = (key:RentalSpecification): string[] => [...new Set<string>(specificationRows.map((e:any)=>rentalSpecifications(e.name)[key]).filter(Boolean))].sort((a,b)=>parseFloat(a)-parseFloat(b)||a.localeCompare(b));
  const rentalOnly = equipmentTab !== "all";
  const baseRows = (loaded?.rows || []).filter(
    (e: any) =>
      (equipmentTab === "all" || specificationFields.every(([key]) => matchesRentalSpecification(rentalSpecifications(e.name)[key], specFilters[key], key))) &&
      (!ownership || e.ownership === ownership) &&
      (!state ||
        (state === "none" ? !e.plans : e.forecast?.status === state)) &&
      (!query.trim() ||
        fold(
          [
            e.id,
            e.rental ? e.internal_code : "",
            e.name,
            e.model,
            e.serial,
            e.brand,
            e.rentalStatus?.customer,
            e.rentalStatus?.label,
            e.rentalStatus?.contract?.label,
            e.rentalStatus?.stockNote,
            ...(e.clients || []).map((c: any) => c.name || c.id),
          ].join(" "),
        ).includes(fold(query.trim()))),
  );
  const rentalRows = baseRows.filter((e: any) => e.rental);
  const rentalOptions = [
    ["", "Todos"],
    ["available", "Disponível"],
    ["unavailable", "Indisponível"],
    ["in_review", "Em Revisão"],
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
    key,
    label,
    count: contractRows.filter(
      (e: any) => key === "all" || e.rentalStatus.key === key,
    ).length,
  }));
  const typedContractRows = contractRows.filter(
    (e: any) => contractType === "all" || e.rentalStatus.key === contractType,
  );
  const contractOptions = [
    ["all", "Todos"],
    ["current", "Dentro do prazo"],
    ["soon", "Próximo do vencimento"],
    ["overdue", "Vencido"],
    ["incomplete", "Conferir datas"],
  ].map(([key, label]) => ({
    key,
    label,
    count: typedContractRows.filter(
      (e: any) =>
        key === "all" || (e.rentalStatus.contract?.key || "incomplete") === key,
    ).length,
  }));
  const [planTab, setPlanTab] = useState("plan");
  const filteredRows = baseRows.filter((e: any) => {
    if (equipmentTab === "all") return true;
    if (!e.rental) return false;
    if (equipmentTab === "rental")
      return !rentalStatus || e.rentalStatus?.key === rentalStatus;
    return (
      ["rented", "loaned"].includes(e.rentalStatus?.key) &&
      (contractType === "all" || e.rentalStatus.key === contractType) &&
      (!contractStatus ||
        contractStatus === "all" ||
        (e.rentalStatus.contract?.key || "incomplete") === contractStatus)
    );
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
  const groups = new Map<string, {id: string; name: string; city?: string; state?: string; document?: string; equipment: any[]}>();
  for (const equipment of filteredRows) {
    const clients = equipment.clients?.length ? equipment.clients : [{id: "unassigned", name: "Sem cliente vinculado"}];
    for (const client of clients) {
      const key = String(client.id);
      if (!groups.has(key)) groups.set(key, {id: key, name: client.name || `Cliente ${key}`, city: client.city, state: client.state, document: client.document, equipment: []});
      const group = groups.get(key)!;
      if (!group.equipment.some(item => item.id === equipment.id)) group.equipment.push(equipment);
    }
  }
  const clientGroups = [...groups.values()].sort((a,b) => a.name.localeCompare(b.name, "pt-BR"));
  const pages = Math.max(1, Math.ceil((equipmentView === "clients" ? clientGroups.length : filteredRows.length) / 30));
  const currentPage = Math.min(page, pages);
  const displayRows = equipmentView === "clients"
    ? clientGroups.slice((currentPage - 1) * 30, currentPage * 30).flatMap(group => [
        {group, key: `client:${group.id}`},
        ...(expandedClients.has(group.id) ? group.equipment.map(e => ({...e, key: `${group.id}:${e.id}`})) : []),
      ])
    : filteredRows.slice((currentPage - 1) * 30, currentPage * 30);
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
    if (initialPlan.current) {
      const p = d.plans.find((p: any) => p.id === initialPlan.current);
      if (p) {
        setPlan({ ...p.document });
        setPlanEdit(p); setPlanTab("plan");
      }
      initialPlan.current = "";
    }
  };
  useEffect(() => {
    const cached = cachedEquipmentList();
    if (cached) {
      setResult(cached);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(() => {
      api(
        "?" +
          new URLSearchParams({
            all: "1",
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
  }, [refresh]);
  useEffect(() => setPage(1), [query, ownership, state]);
  useEffect(() => {
    if (!selected) {
      setDetail(null);
      return;
    }
    const controller = new AbortController();
    setDetailLoading(true);
    setDetail(null);
    setSaveError("");
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
    setSaveError("");
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
      setSaveError((e as Error).message);
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
  const planEditor = plan ? (<form
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
                        <nav className="preventive-editor-tabs" aria-label="Edição do plano">
                          {[["plan","Plano"],["material","Produtos"],["service","Serviços"]].map(([key,label]) => <button type="button" key={key} aria-current={planTab === key ? "page" : undefined} onClick={() => setPlanTab(key)}>{label}</button>)}
                        </nav>
                        <div className="equipment-form-grid" hidden={planTab !== "plan"}>
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
                            Horímetro na última intervenção (0 sem data = nunca realizada)
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
                        <div hidden={planTab === "plan"}>
                        <PreventivePlanItems
                          viewKind={planTab === "service" ? "service" : "material"}
                          equipment={detail.equipment}
                          clients={detail.quoteClients || detail.clients}
                          items={plan.items || []}
                          disabled={saving}
                          onChange={(items) => setPlan({ ...plan, items })}
                        />
                        </div>
                        <p className="muted" hidden={planTab !== "plan"}>
                          Intervalos são contados desde a última intervenção
                          deste plano. Pode salvar sem a data ou leitura
                          inicial, mas a previsão ficará incompleta. Se este for
                          o primeiro serviço, informe a data e leitura de início
                          de operação como referência.
                        </p>
                        {planTab === "plan" && preview && (
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
                    </form>) : null;
  const maintenanceEditor = maintenance ? (<form
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
                    </form>) : null;
  return (
    <EquipmentTaskProvider>
      <SiteHeader active="equipment" email={result?.email} />
      <main className="equipment-page catalog-settings">
        <section className="manual-card">
          <h1>Equipamentos</h1>
          {admin && (
            <div className="catalog-editor-actions">
              <a
                className="button"
                href="/api/preventive-reports?kind=weekly&format=pdf"
                target="_blank"
                rel="noopener noreferrer"
              >
                Relatório semanal (PDF)
              </a>
              <a
                className="button"
                href="/api/preventive-reports?kind=overdue&format=pdf"
                target="_blank"
                rel="noopener noreferrer"
              >
                Preventivas vencidas (PDF)
              </a>
            </div>
          )}
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
        {saveError && (
          <div role="alert" className="equipment-save-error">
            <span>{saveError}</span>
            <button type="button" aria-label="Fechar mensagem de erro" onClick={() => setSaveError("")}>×</button>
          </div>
        )}
        {message && <p role="status">{message}</p>}
        {!selected ? (
          <section className="manual-card">
            <nav
              className="equipment-view-tabs app-section-tabs"
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
                    setSpecFilters({hp:"",pcm:"",pressure:""});
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
                className="equipment-rental-status-filters equipment-rental-status-cards"
                role="group"
                aria-label="Status das máquinas de locação"
              >
                <h3>Situação das máquinas de locação</h3>
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
                <div
                  className="equipment-rental-status-filters equipment-contract-filter-group equipment-rental-status-cards equipment-contract-type-cards"
                  role="group"
                  aria-label="Tipo de contrato"
                >
                  <h3>Tipo</h3>
                  {contractTypeOptions.map(({ key, label, count }) => (
                    <button
                      type="button"
                      key={key}
                      className={`rental-filter-${key}`}
                      aria-pressed={contractType === key}
                      onClick={() => {
                        setContractType(key);
                        setPage(1);
                      }}
                    >
                      {label} <strong>{count}</strong>
                    </button>
                  ))}
                </div>
                <div
                  className="equipment-rental-status-filters equipment-contract-filters equipment-contract-filter-group equipment-rental-status-cards equipment-contract-deadline-cards"
                  role="group"
                  aria-label="Situação do contrato de locação ou empréstimo"
                >
                  <h3>Prazo do contrato</h3>
                  {contractOptions.map(({ key, label, count }) => (
                    <button
                      type="button"
                      key={key}
                      className={`contract-filter-${key}`}
                      aria-pressed={
                        contractStatus === key ||
                        (!contractStatus && key === "all")
                      }
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
            <details className="equipment-search-filter-panel">
              <summary><Settings2 size={18} aria-hidden="true" /><span>Filtros de pesquisa</span><ChevronDown size={18} className="equipment-filter-chevron" aria-hidden="true" /></summary>
              <div className="equipment-search-filter-content">
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
            {rentalOnly && <div className="equipment-rental-spec-filters">
              {specificationFields.map(([key,label]) => key === "pressure" ? <label key={key} className="equipment-spec-card"><span className="equipment-spec-heading"><Gauge size={18} aria-hidden="true" />{label}</span>
                <select value={specFilters[key]} onChange={event=>{setSpecFilters(previous=>({...previous,[key]:event.target.value}));setPage(1);}}>
                  <option value="">Todos</option>
                  {specificationOptions(key).map(value=><option key={value} value={value}>{value.replace('.',',')}</option>)}
                  <option value="missing">Não informado no nome</option>
                </select>
              </label> : <div key={key} className="equipment-spec-range equipment-spec-card" role="group" aria-label={label}><div className="equipment-spec-heading">{key === "hp" ? <Settings2 size={18} aria-hidden="true" /> : <Wind size={18} aria-hidden="true" />}{label}</div>
                <div className="equipment-spec-range-buttons">
                  {[{id:"",label:"Todos"},...rentalSpecificationRanges.map(range=>({id:range.id,label:`${range.label} ${key.toUpperCase()}`})),{id:"missing",label:"Não informado"}].map(option=><button type="button" key={option.id} aria-pressed={specFilters[key] === option.id} onClick={()=>{setSpecFilters(previous=>({...previous,[key]:previous[key] === option.id ? "" : option.id}));setPage(1);}}>{option.label}</button>)}
                </div>
              </div>)}
            </div>}
              </div>
            </details>
            <nav className="app-section-tabs equipment-view-tabs" aria-label="Visualização dos equipamentos">
              <button type="button" aria-pressed={equipmentView === "list"} onClick={() => {setEquipmentView("list"); setPage(1);}}>Lista</button>
              <button type="button" aria-pressed={equipmentView === "clients"} onClick={() => {setEquipmentView("clients"); setPage(1);}}>Agrupado por Cliente</button>
            </nav>
            {equipmentView === "clients" && <p className="equipment-group-hint">{clientGroups.length} grupos · Equipamentos com mais de um vínculo aparecem em cada cliente. Quantidades conforme os filtros selecionados.</p>}
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
                  {displayRows.map((e: any) => e.group ? (
                    <tr key={e.key} className="equipment-client-group">
                      <td colSpan={7}>
                        <button type="button" aria-expanded={expandedClients.has(e.group.id)} onClick={() => setExpandedClients(previous => {
                          const next = new Set(previous);
                          if (next.has(e.group.id)) next.delete(e.group.id); else next.add(e.group.id);
                          return next;
                        })}>
                          <ChevronDown size={18} className={expandedClients.has(e.group.id) ? "" : "collapsed"} aria-hidden="true" />
                          <span className="equipment-client-identity">
                            <span className="equipment-client-names"><strong>{e.group.name}</strong>{(e.group.city || e.group.state) && <span className="equipment-client-location">{[e.group.city, e.group.state].filter(Boolean).join(" / ")}</span>}</span>
                            {e.group.id !== "unassigned" && <small>{e.group.document ? e.group.document.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : "CNPJ não informado"}</small>}
                          </span>
                          <b>{e.group.equipment.length} {e.group.equipment.length === 1 ? "equipamento" : "equipamentos"}</b>
                        </button>
                      </td>
                    </tr>
                  ) : (
                    <tr key={e.key || e.id}>
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
                          <>
                            <RentalBadge status={e.rentalStatus} />
                            <EquipmentTaskLinks equipment={String(e.id)} />
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        <div className="order-row-actions equipment-row-actions">
                        <button
                          type="button"
                          className="equipment-view-button"
                          aria-label={`Visualizar equipamento ${e.name}`}
                          title="Visualizar equipamento"
                          onClick={() => {
                            setPreviewEquipment(String(e.id));
                            setMessage("");
                          }}
                        >
                          <Eye size={17} aria-hidden="true" />
                        </button>
                        <button
                          className="catalog-edit-button"
                          onClick={() => {
                            setSelected(e.id);
                            setMessage("");
                          }}
                        >
                          <Wrench size={14} /> Gerenciar
                        </button>
                        <CreateLinkedTask equipmentId={String(e.id)}/>
                        </div>
                        <small className="equipment-plan-updated" title="Última alteração entre os planos preventivos ativos deste equipamento">
                          {e.plansUpdatedAt ? `Planos atualizados: ${new Date(e.plansUpdatedAt).toLocaleString("pt-BR", {timeZone:"America/Sao_Paulo",dateStyle:"short",timeStyle:"short"})}` : "Planos: sem alteração registrada"}
                          {e.plansUpdatedAt && <><br />{e.lastModifiedPlanName || "Plano preventivo"}<br />Por: {e.plansUpdatedBy || "Não informado"}</>}
                        </small>
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
                    <>
                      <RentalBadge status={detail.equipment.rentalStatus} />
                      <EquipmentTaskLinks equipment={String(selected)} />
                    </>
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
                            className={operating.ownership === "unknown" ? "equipment-classification-pending" : undefined}
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
                    <div className="preventive-plan-actions">
                    <button
                      disabled={saving}
                      className="catalog-edit-button"
                      onClick={() => {
                        setPlan({ ...emptyPlan });
                        setPlanEdit(null); setPlanTab("plan");
                        setMaintenance(null);
                      }}
                    >
                      <Plus size={15} /> Criar plano
                    </button>
                    <CopyPreventivePlan disabled={saving} onCopy={copy => {setPlan({...emptyPlan,...copy});setPlanEdit(null);setPlanTab("plan");setMaintenance(null);}}/>
                    </div>
                  </div>
                  {plan && !planEdit && planEditor}
                  <p className="muted">
                    Com horas e meses preenchidos, vale o limite que chegar
                    primeiro. Ao registrar uma manutenção, os planos com
                    intervalos menores também são atualizados, preservando
                    intervenções mais recentes.
                  </p>
                  <div className="equipment-table">
                    <table className="equipment-preventive-plans-table">
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
                          <Fragment key={p.id}><tr>
                            <td>
                              <strong>{p.document.name}</strong>
                              {p.forecast.target != null && !p.forecast.coveredBy && !p.forecast.inconsistent && p.id === [...detail.plans].filter((v: any) => v.forecast.target != null && !v.forecast.coveredBy && !v.forecast.inconsistent).sort((a: any,b: any) => a.forecast.target - b.forecast.target || Number(b.document.hours) - Number(a.document.hours))[0]?.id && <span className="equipment-next-preventive">Próxima Preventiva</span>}
                              <small>{p.document.notes}</small>
                              <small>
                                {p.document.items?.length || 0} materiais e
                                serviços cadastrados
                              </small>
                              {!!p.document.items?.length && (
                                <details>
                                  <summary>Ver itens do plano</summary>
                                  <ul>
                                    {p.document.items.map((i: any) => (
                                      <li key={`${i.kind}:${i.code}`}>
                                        {i.quantity} {i.unit} · {i.name} · Cód.{" "}
                                        {i.code}
                                      </li>
                                    ))}
                                  </ul>
                                </details>
                              )}
                              <EquipmentTaskLinks
                                equipment={String(selected)}
                                plan={p.id}
                                hourly={!!p.document.hours}
                              />
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
                              {p.document.lastMeter === 0 && !p.document.lastDate ? "Nunca realizada" : date(p.document.lastDate)}
                              <small>
                                Horímetro: {qty(p.document.lastMeter)} h
                              </small>
                              {p.document.lastOrder && (
                                <OrderLink id={p.document.lastOrder} equipment={String(selected)} />
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
                                  title={plan && planEdit?.id === p.id ? "Fechar edição do plano" : "Editar plano"}
                                  aria-expanded={!!plan && planEdit?.id === p.id}
                                  aria-label={`Editar ${p.document.name}`}
                                  onClick={() => {
                                    if (plan && planEdit?.id === p.id) {
                                      setPlan(null);
                                      setPlanEdit(null);
                                      return;
                                    }
                                    setPlan({ ...p.document });
                                    setPlanEdit(p); setPlanTab("plan");
                                    setMaintenance(null);
                                  }}
                                >
                                  <Pencil size={15} />
                                </button>
                                <button
                                  disabled={saving}
                                  title={maintenance?.plan.id === p.id ? "Fechar registro de manutenção" : "Registrar manutenção realizada"}
                                  aria-expanded={maintenance?.plan.id === p.id}
                                  aria-label={`Registrar manutenção de ${p.document.name}`}
                                  onClick={() => {
                                    if (maintenance?.plan.id === p.id) {
                                      setMaintenance(null);
                                      return;
                                    }
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
                                  disabled={saving || !p.document.items?.length}
                                  title="Gerar orçamento com os itens salvos do plano"
                                  onClick={() => setQuotePlan(p)}
                                >
                                  Gerar orçamento
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
                          {plan && planEdit?.id === p.id && <tr><td colSpan={6}>{planEditor}</td></tr>}
                          {maintenance?.plan.id === p.id && <tr><td colSpan={6}>{maintenanceEditor}</td></tr>}
                          </Fragment>
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
                          <th>Tipo / atendimento</th>
                          <th>Origem do vínculo</th>
                          <th>Ações</th>
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
                              <small>{o.tipo_atendimento_nome || "Não informado"}</small>
                            </td>
                            <td>
                              {o.method === "observation"
                                ? "Identificado nas observações"
                                : o.method === "serial"
                                  ? "Número de série"
                                  : "Equipamento atribuído na OS"}
                            </td>
                            <td>
                              <div className="order-row-actions">
                              <button
                                type="button"
                                className="icon-button"
                                title="Visualizar OS"
                                aria-label={`Visualizar OS ${o.id}`}
                                onClick={() =>
                                  setOrderSelection({
                                    company_id: Number(o.company_id),
                                    id: String(o.id),
                                    number: String(o.id),
                                  })
                                }
                              >
                                <Eye size={17} />
                              </button>
                              <CreateLinkedTask orderId={String(o.id)} orderCompany={o.company_id} equipmentId={String(selected)}/>
                              </div>
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
                                {e.document.action === "quote"
                                  ? "Orçamento criado"
                                  : {
                                      settings: "Operação atualizada",
                                      plan: "Plano salvo",
                                      maintenance: "Manutenção realizada",
                                      archive: "Plano arquivado",
                                    }[e.kind as string] || e.kind}
                                <small>{date(e.created_at)}</small>
                              </td>
                              <td>
                                {e.document.planName ||
                                  e.document.after?.name ||
                                  "Configuração do equipamento"}
                                {e.document.quoteId && (
                                  <small>
                                    {e.quote_deleted_at ? (
                                      <span>
                                        ORÇ-
                                        {String(
                                          e.document.quoteNumber,
                                        ).padStart(5, "0")}{" "}
                                        · Rascunho excluído em{" "}
                                        {date(e.quote_deleted_at)}
                                      </span>
                                    ) : (
                                      <a
                                        href={`/orcamentos?id=${encodeURIComponent(e.document.quoteId)}`}
                                      >
                                        Abrir ORÇ-
                                        {String(
                                          e.document.quoteNumber,
                                        ).padStart(5, "0")}
                                      </a>
                                    )}{" "}
                                    · {e.document.client || "Cliente a definir"}
                                  </small>
                                )}
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
      {previewEquipment && <EquipmentDetailsDrawer key={previewEquipment} id={previewEquipment} onClose={() => setPreviewEquipment("")} />}
      {quotePlan && detail && (
        <PreventivePlanQuote
          equipment={selected}
          plan={quotePlan}
          clients={detail.quoteClients || detail.clients}
          onClose={() => setQuotePlan(null)}
        />
      )}
      {orderSelection && (
        <OrderDetails
          selection={orderSelection}
          onClose={() => setOrderSelection(null)}
        />
      )}
    </EquipmentTaskProvider>
  );
}
