"use client";
import { useEffect, useMemo, useState } from "react";
import { fold } from "@/lib/filters";
import { BookOpen, Search } from "lucide-react";
import SiteHeader from "./site-header";
import CatalogProducts from "./catalog-products";
import {
  intervalInfo,
  type IntervalOption,
} from "@/lib/manufacturer/intervals";
import type { CatalogProduct } from "@/lib/manufacturer/products";
import type { Variant, SerialMatch } from "@/lib/manufacturer/rules";
type Entry = {
  id: string;
  variant_id: string;
  variant_name: string;
  row_number: number;
  section: string;
  description: string;
  code_original: string;
  observation: string;
  interval_original: string;
  interval_hours?: string | number | null;
  issues: string[];
  match: SerialMatch;
  products: CatalogProduct[];
};
type Result = {
  email: string;
  revision: { filename: string; imported_at: string } | null;
  variants: (Variant & { match: SerialMatch })[];
  rows: Entry[];
  intervals?: IntervalOption[];
  total: number;
  page: number;
  consumption: null | {
    orders: number;
    imported: number;
    clients: number;
    inferred?: number;
    truncated: boolean;
    rows: {
      product_id: string | null;
      name: string;
      unit: string;
      quantity: string;
      orders: number;
      last_used: string | null;
    }[];
  };
};
const date = (v: string | null) =>
  v
    ? new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Sao_Paulo",
      }).format(new Date(v))
    : "—";
const historyLink = (company: string | number, serial = "", productId = "") =>
  "/?" +
  new URLSearchParams({
    company: String(company),
    exactSerial: serial,
    productId,
    view: productId ? "materials" : "orders",
  });
export default function ManufacturerDashboard() {
  const [data, setData] = useState<Result | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [query, setQuery] = useState<string | null>(null),
    [refresh, setRefresh] = useState(0);
  const [form, setForm] = useState({
    q: "",
    list: "",
    model: "",
    serial: "",
    company: "",
    variant: "",
    review: false,
    interval: "",
  });
  const [intervals, setIntervals] = useState<IntervalOption[]>([]);
  const [intervalsLoading, setIntervalsLoading] = useState(false);
  const [intervalsError, setIntervalsError] = useState("");
  useEffect(() => {
    if (query === null) return;
    const controller = new AbortController();
    setIntervalsLoading(true);
    setIntervalsError("");
    const timer = setTimeout(() => {
      const p = new URLSearchParams({
        options: "intervals",
        model: form.model,
        serial: form.serial,
        variant: form.variant,
      });
      fetch("/api/manufacturer?" + p, { signal: controller.signal })
        .then(async (r) => {
          if (r.status === 401) {
            window.location.assign("/login");
            return;
          }
          if (!r.ok)
            throw new Error(
              "Não foi possível listar os intervalos. Confira modelo e série.",
            );
          const body = await r.json();
          setIntervals(body.intervals || []);
        })
        .catch((e) => {
          if (e.name !== "AbortError") setIntervalsError(e.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setIntervalsLoading(false);
        });
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query === null, form.model, form.serial, form.variant, refresh]);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    p.delete("company");
    const localFilter = p.get("list") || "";
    p.delete("list");
    setForm({
      q: p.get("q") || "",
      list: localFilter,
      model: p.get("model") || "",
      serial: p.get("serial") || "",
      company: "",
      variant: p.get("variant") || "",
      review: p.get("review") === "1",
      interval: p.get("interval") || "",
    });
    setQuery(p.toString());
  }, []);
  useEffect(() => {
    if (query === null) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetch("/api/manufacturer?" + query, { signal: controller.signal })
      .then(async (r) => {
        if (r.status === 401) {
          window.location.assign("/login");
          return;
        }
        const body = await r.json();
        if (!r.ok) throw new Error(body.error || "Não foi possível consultar.");
        setData(body);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [query, refresh]);
  function search(page = 1, clear = false) {
    const p = new URLSearchParams();
    if (!clear)
      for (const [k, v] of Object.entries(form))
        if (v && k !== "list") p.set(k, k === "review" ? "1" : String(v));
    p.set("page", String(page));
    if (clear)
      setForm({
        q: "",
        list: "",
        model: "",
        serial: "",
        company: "",
        variant: "",
        review: false,
        interval: "",
      });
    window.history.replaceState(null, "", "/fabricante?" + p);
    setQuery(p.toString());
    setRefresh((n) => n + 1);
  }
  const applied = new URLSearchParams(query || ""),
    company = applied.get("company") || "",
    serial = applied.get("serial") || "";
  const variants = data?.variants || [];
  const indexedRows = useMemo(
    () =>
      (data?.rows || []).map((entry) => ({
        entry,
        text: fold(
          [
            entry.description,
            entry.code_original,
            entry.section,
            entry.observation,
            entry.variant_name,
            entry.interval_original,
            ...entry.products.flatMap((p) => [
              p.name,
              p.product_id,
              p.reference,
              p.similarity,
            ]),
          ].join(" "),
        ),
      })),
    [data],
  );
  const visibleRows = useMemo(() => {
    const text = fold(form.list.trim());
    return indexedRows
      .filter((row) => row.text.includes(text))
      .map((row) => row.entry);
  }, [indexedRows, form.list]);

  return (
    <>
      <SiteHeader active="manufacturer" email={data?.email} />
      <main className="manual-page">
        <div className="manual-title">
          <BookOpen size={30} />
          <div>
            <h1>Catálogo do fabricante</h1>
            <p>
              Peças originais, referências e histórico das ordens de serviço.
            </p>
          </div>
        </div>
        <form
          className="manual-card manual-filters"
          onSubmit={(e) => {
            e.preventDefault();
            setForm((current) => ({ ...current, list: "" }));
            search();
          }}
        >
          <label className="manual-global">
            Pesquisa global
            <input
              value={form.q}
              placeholder="Descrição, código, modelo, série ou condição de aplicação"
              onChange={(e) => setForm({ ...form, q: e.target.value })}
            />
          </label>
          <label>
            Modelo
            <input
              value={form.model}
              placeholder="Ex.: GA 15"
              onChange={(e) =>
                setForm({
                  ...form,
                  model: e.target.value,
                  variant: "",
                  interval: "",
                })
              }
            />
          </label>
          <label>
            Número de série
            <input
              value={form.serial}
              placeholder="Série completa: busca nas faixas do fabricante"
              onChange={(e) =>
                setForm({
                  ...form,
                  serial: e.target.value,
                  variant: "",
                  interval: "",
                })
              }
            />
          </label>
          <label className="manual-global">
            Versão / aba da planilha
            <select
              value={form.variant}
              onChange={(e) =>
                setForm({ ...form, variant: e.target.value, interval: "" })
              }
            >
              <option value="">Todas as versões candidatas</option>
              {variants.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Intervalo informado
            <select
              value={form.interval}
              disabled={intervalsLoading || !!intervalsError}
              onChange={(e) => setForm({ ...form, interval: e.target.value })}
            >
              <option value="">
                {intervalsLoading
                  ? "Carregando intervalos…"
                  : "Todos os intervalos"}
              </option>
              {form.interval &&
                !intervals.some((i) => i.value === form.interval) && (
                  <option value={form.interval}>
                    Intervalo selecionado (fora deste modelo)
                  </option>
                )}
              {intervals.map((i) => (
                <option key={i.value} value={i.value}>
                  {i.label} ({i.count})
                </option>
              ))}
            </select>
            {intervalsError && <small role="alert">{intervalsError}</small>}
          </label>
          <label className="manual-check">
            <input
              type="checkbox"
              checked={form.review}
              onChange={(e) => setForm({ ...form, review: e.target.checked })}
            />
            Somente itens com dados a conferir
          </label>
          <div className="manual-actions">
            <button type="submit" disabled={loading}>
              <Search size={16} />
              Pesquisar
            </button>
            <button type="button" onClick={() => search(1, true)}>
              Limpar filtros
            </button>
          </div>
        </form>
        <p className="manual-note">
          A correspondência de código identifica um vínculo cadastral, não
          confirma equivalência técnica. Confira geração, série, pressão, tensão
          e observações antes de aplicar a peça. A planilha é uma referência
          fornecida pela equipe e não recebe atualizações automáticas do
          fabricante.
        </p>
        {applied.get("interval") && (
          <p className="manual-note">
            {applied.get("interval")?.startsWith("h:")
              ? "Inclui os intervalos menores que se repetem nesta revisão. "
              : "Exibindo os itens com a indicação selecionada. "}
            Confira as condições da versão e os itens sem intervalo informado;
            esta seleção não substitui o plano completo de manutenção.
          </p>
        )}
        {error && (
          <div role="alert" className="error">
            {error}
          </div>
        )}
        {loading ? (
          <p role="status">Consultando catálogo…</p>
        ) : (
          !error &&
          data && (
            <>
              {!data.revision ? (
                <div className="manual-card">
                  Nenhuma planilha importada. Execute a importação do catálogo
                  para iniciar a consulta.
                </div>
              ) : (
                <>
                  <p className="muted">
                    Fonte: {data.revision.filename} · Importada em{" "}
                    {date(data.revision.imported_at)} · {data.total} itens
                    encontrados
                  </p>
                  <div
                    className={
                      data.consumption
                        ? "manual-layout"
                        : "manual-layout single"
                    }
                  >
                    <section className="manual-card">
                      <h2>Peças e produtos correspondentes</h2>
                      <label className="manual-list-filter">
                        Filtrar itens da lista
                        <input
                          value={form.list}
                          maxLength={160}
                          placeholder="Descrição, código ou referência"
                          onChange={(e) =>
                            setForm({ ...form, list: e.target.value })
                          }
                        />
                      </label>
                      {variants.length > 1 && (
                        <p className="manual-note">
                          Há {variants.length} versões candidatas. Escolha a aba
                          após conferir as condições de aplicação; a série pode
                          exigir interpretação manual.
                        </p>
                      )}
                      <details className="manual-versions">
                        <summary>
                          Conferir modelos, séries e condições das versões (
                          {variants.length})
                        </summary>
                        {variants.map((v) => (
                          <div key={v.id}>
                            <h3>{v.name}</h3>
                            <p>{v.header.join(" · ")}</p>
                            <p>
                              {v.rules
                                .map(
                                  (r) =>
                                    `${r.model}: ${r.serial} (SELEÇÃO!${r.cell})`,
                                )
                                .join(" · ")}
                            </p>
                            {v.issues.map((i) => (
                              <p key={i} className="excluded-label">
                                {i}
                              </p>
                            ))}
                          </div>
                        ))}
                      </details>
                      <small>
                        {visibleRows.length} de {data.rows.length} itens desta
                        página · filtro local
                      </small>
                      {!visibleRows.length ? (
                        <p>
                          {data.rows.length
                            ? "Nenhuma peça corresponde ao filtro nesta página. Limpe o texto ou consulte outra página."
                            : "Nenhuma peça encontrada. Revise os filtros ou consulte outra versão."}
                        </p>
                      ) : (
                        <div className="manual-table-scroll">
                          <table className="manual-table">
                            <thead>
                              <tr>
                                <th>Peça do fabricante</th>
                                <th>Aplicação / origem</th>
                                <th>Produtos M8</th>
                              </tr>
                            </thead>
                            <tbody>
                              {visibleRows.map((e) => (
                                <tr key={e.id}>
                                  <td>
                                    <strong>{e.description}</strong>
                                    <code>
                                      {e.code_original ||
                                        "Código não informado"}
                                    </code>
                                    <small>{e.section}</small>
                                    {e.interval_original && (
                                      <p>
                                        Intervalo informado:{" "}
                                        {intervalInfo(e).label}
                                      </p>
                                    )}
                                    {e.issues.map((i) => (
                                      <small key={i} className="excluded-label">
                                        {i}
                                      </small>
                                    ))}
                                  </td>
                                  <td>
                                    <strong>{e.variant_name}</strong>
                                    <small>
                                      Aba {e.variant_name} · linha{" "}
                                      {e.row_number}
                                    </small>
                                    <p>
                                      {e.observation ||
                                        "Sem observação adicional na linha."}
                                    </p>
                                    <small>
                                      {e.match === "match"
                                        ? "Série localizada na regra da versão; confira as demais condições."
                                        : e.match === "no"
                                          ? "Versão selecionada diverge do filtro; confira a aplicação."
                                          : "Aplicação por série a conferir."}
                                    </small>
                                  </td>
                                  <td>
                                    {!e.products.length ? (
                                      <span className="muted">
                                        Nenhum código correspondente no cadastro
                                        importado.
                                      </span>
                                    ) : (
                                      <CatalogProducts
                                        products={e.products}
                                        serial={serial}
                                      />
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                      <div className="manual-pagination">
                        <button
                          disabled={data.page <= 1}
                          onClick={() => search(data.page - 1)}
                        >
                          Anterior
                        </button>
                        <span>
                          Página {data.page} de{" "}
                          {Math.max(1, Math.ceil(data.total / 50))}
                        </span>
                        <button
                          disabled={data.page * 50 >= data.total}
                          onClick={() => search(data.page + 1)}
                        >
                          Próxima
                        </button>
                      </div>
                    </section>
                    {data.consumption && (
                      <aside className="manual-card manual-consumption">
                        <h2>Materiais das OS da série</h2>
                        <p>
                          <strong>{serial}</strong> · Todas as empresas
                        </p>
                        <p>
                          {data.consumption.orders} OS associadas ·{" "}
                          {data.consumption.imported} com detalhes importados.
                        </p>
                        <p className="manual-note">
                          Quantidades de OS processadas e com coleta concluída,
                          sem itens excluídos. Uma OS pode atender vários
                          equipamentos: estes totais não comprovam consumo
                          exclusivo desta máquina.
                        </p>
                        {!!data.consumption.inferred && (
                          <p className="muted">
                            {data.consumption.inferred} OS incluem vínculos
                            automáticos por série nas observações. A origem pode
                            ser conferida no detalhe da OS.
                          </p>
                        )}
                        {data.consumption.clients > 1 && (
                          <p className="excluded-label">
                            Esta série aparece em mais de um cliente. Confira as
                            OS antes de interpretar os totais.
                          </p>
                        )}
                        <a href={historyLink(company, serial)}>
                          Consultar OS desta série
                        </a>
                        {!data.consumption.rows.length ? (
                          <p>
                            Nenhum consumo elegível encontrado na base
                            importada.
                          </p>
                        ) : (
                          <ul>
                            {data.consumption.rows.map((r, i) => (
                              <li key={i}>
                                <strong>
                                  {r.name ||
                                    r.product_id ||
                                    "Material sem identificação"}
                                </strong>
                                <p>
                                  {Number(r.quantity).toLocaleString("pt-BR")}{" "}
                                  {r.unit || "unidade não informada"} ·{" "}
                                  {r.orders} OS
                                </p>
                                <small>
                                  Última aplicação: {date(r.last_used)}
                                </small>
                                {r.product_id && (
                                  <a
                                    href={historyLink(
                                      company,
                                      serial,
                                      r.product_id,
                                    )}
                                  >
                                    Ver aplicações
                                  </a>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                        {data.consumption.truncated && (
                          <p>
                            Mostrando os 100 materiais com aplicação mais
                            recente.
                          </p>
                        )}
                      </aside>
                    )}
                  </div>
                  {!data.consumption && (
                    <p className="manual-note">
                      Informe a série completa para ver as OS associadas ao lado
                      do catálogo.
                    </p>
                  )}
                </>
              )}
            </>
          )
        )}
      </main>
    </>
  );
}
