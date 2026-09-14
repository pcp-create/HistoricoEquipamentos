"use client";
import { useEffect, useState } from "react";
import { Pencil, Save, X, Plus } from "lucide-react";
import SiteHeader from "./site-header";
import {
  blankCatalogRecord,
  catalogFields,
  additionalCatalogFields,
  type CatalogRecord,
} from "@/lib/manufacturer/configuration";
import { fold } from "@/lib/manufacturer/rules";
type Version = {
  id: string;
  name: string;
  header: string[];
  models: string[];
  rules: { model: string; serial: string }[];
  issues: string[];
  items: number;
  filename: string;
};
type Entry = {
  id: string;
  section: string;
  description: string;
  code_original: string;
  interval_original: string;
  observation: string;
};
async function api(url: string, options?: RequestInit) {
  const r = await fetch(url, options);
  if (r.status === 401) {
    window.location.assign("/login");
    throw new Error("Sessão expirada.");
  }
  const body = await r.json();
  if (!r.ok) throw new Error(body.error || "Não foi possível concluir.");
  return body;
}
export default function CatalogConfiguration() {
  const [email, setEmail] = useState("");
  const [versions, setVersions] = useState<Version[]>([]);
  const [query, setQuery] = useState("");
  const [version, setVersion] = useState("");
  const [items, setItems] = useState<Entry[]>([]);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [original, setOriginal] = useState<Entry | null>(null);
  const [form, setForm] = useState(blankCatalogRecord);
  const [preview, setPreview] = useState<{
    records: CatalogRecord[];
    errors: string[];
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    api("/api/catalog-configuration", { signal: controller.signal })
      .then((b) => {
        setVersions(b.versions);
        setEmail(b.email);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [refresh]);
  useEffect(() => {
    setItems([]);
    setEditing(null);
    setOriginal(null);
    if (!version) return;
    const controller = new AbortController();
    api(
      "/api/catalog-configuration?" + new URLSearchParams({ variant: version }),
      { signal: controller.signal },
    )
      .then((b) => setItems(b.items))
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [version, refresh]);
  async function save(records: CatalogRecord[], manual = false) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await api("/api/catalog-configuration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ records }),
      });
      setMessage(
        `${result.inserted} item(ns) adicionado(s). ${result.skipped} item(ns) idêntico(s) já existente(s).`,
      );
      setRefresh((n) => n + 1);
      if (manual)
        setForm((f) => ({
          ...f,
          description: "",
          reference: "",
          observation: "",
          internalCode: "",
          quantity: "",
          drawingCode: "",
          saleFactor: "",
        }));
      else setPreview(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function saveEdit() {
    if (!editing || !original) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await api("/api/catalog-configuration", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...editing, previous: original }),
      });
      setItems((rows) =>
        rows.map((row) => (row.id === result.item.id ? result.item : row)),
      );
      setEditing(null);
      setOriginal(null);
      setMessage(
        "Item atualizado no catálogo e nas próximas consultas de orçamento.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const selected = versions.find((v) => v.id === version);
  const versionParts = selected?.name.split(" · ") || [];
  const structuredVersion =
    selected?.id.startsWith("managed:") || selected?.id.startsWith("pistao:");
  const manufacturer = structuredVersion
    ? versionParts[0]
    : "Não informado na origem";
  const model = selected?.id.startsWith("managed:")
    ? selected.header[1]
    : selected?.models.join(" · ");
  const versionName = structuredVersion
    ? versionParts.slice(2).join(" · ")
    : selected?.name;
  const serialRange = selected?.header.includes("Aplicação somente por modelo")
    ? "Sem restrição de série (por modelo)"
    : selected?.rules.map((r) => `${r.model}: ${r.serial}`).join(" · ") ||
      "Não informada";
  return (
    <>
      <SiteHeader active="settings" email={email} />
      <main className="catalog-settings">
        <section className="manual-card">
          <h1>Configuração do catálogo do fabricante</h1>
          <p>
            Consulte a estrutura cadastrada e inclua peças de outros
            fabricantes. Os novos itens ficam disponíveis no catálogo e nos
            orçamentos.
          </p>
          <p className="muted">
            Fabricante → modelo → versão / faixa de série → grupo → peça /
            referência genuína → intervalo da revisão. O vínculo com produtos M8
            usa a referência do fabricante e os códigos de similaridade.
          </p>
        </section>
        {error && (
          <p role="alert" className="catalog-settings-error">
            {error}
          </p>
        )}
        {message && <p role="status">{message}</p>}
        <section className="manual-card">
          <h2>Estrutura atual</h2>
          <p>
            {versions.length} versões ·{" "}
            {versions.reduce((sum, v) => sum + Number(v.items), 0)} itens
          </p>
          <label>
            Filtrar versões
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Fabricante, modelo ou versão"
            />
          </label>
          <label>
            Versão cadastrada
            <select
              value={version}
              disabled={busy}
              onChange={(e) => setVersion(e.target.value)}
            >
              <option value="">Selecione para visualizar os itens</option>
              {versions
                .filter(
                  (v) =>
                    fold([v.name, ...v.header].join(" ")).includes(
                      fold(query),
                    ) || v.id === version,
                )
                .map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} · {v.items} itens
                  </option>
                ))}
            </select>
          </label>
          {selected && (
            <>
              <p>
                <b>Origem:</b> {selected.filename}
              </p>
              <p>
                <b>Modelo:</b> {selected.models.join(" · ")}
              </p>
              <p>
                <b>Condições:</b> {selected.header.join(" · ")}
              </p>
              {selected.issues.map((issue, i) => (
                <p key={i}>{issue}</p>
              ))}
              {editing && (
                <fieldset
                  disabled={busy}
                  className="manual-card catalog-item-editor"
                >
                  <legend>Editar item: {original?.description}</legend>
                  {(
                    [
                      ["section", "Grupo"],
                      ["description", "Descrição"],
                      [
                        "code_original",
                        "Referência genuína ou código M8 (ex.: M8:19273)",
                      ],
                      [
                        "interval_original",
                        "Intervalo em horas (vazio quando não informado)",
                      ],
                      ["observation", "Observações / quantidades / condições"],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key}>
                      {label}
                      {key === "observation" ? (
                        <textarea
                          rows={4}
                          value={editing[key]}
                          onChange={(e) =>
                            setEditing({ ...editing, [key]: e.target.value })
                          }
                        />
                      ) : (
                        <input
                          value={editing[key]}
                          onChange={(e) =>
                            setEditing({ ...editing, [key]: e.target.value })
                          }
                        />
                      )}
                    </label>
                  ))}
                  <div className="catalog-editor-actions">
                    <button
                      type="button"
                      className="catalog-save-button"
                      onClick={saveEdit}
                    >
                      <Save size={16} aria-hidden="true" />
                      {busy ? "Salvando…" : "Salvar alterações"}
                    </button>
                    <button
                      type="button"
                      className="catalog-cancel-button"
                      onClick={() => {
                        setEditing(null);
                        setOriginal(null);
                      }}
                    >
                      <X size={16} aria-hidden="true" />
                      Cancelar
                    </button>
                  </div>
                </fieldset>
              )}
              <div className="catalog-settings-table catalog-structure-table">
                <table>
                  <thead>
                    <tr>
                      {[
                        "Fabricante",
                        "Modelo",
                        "Versão",
                        "Faixa de série",
                        "Grupo",
                        "Descrição da peça",
                        "Referência genuína / código M8",
                        "Intervalo em horas",
                        "Observações",
                        "Ações",
                      ].map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((i) => (
                      <tr key={i.id}>
                        <td>{manufacturer}</td>
                        <td>{model || "Não informado"}</td>
                        <td>{versionName}</td>
                        <td>{serialRange}</td>
                        <td>{i.section}</td>
                        <td>{i.description}</td>
                        <td>{i.code_original}</td>
                        <td>{i.interval_original || "Não informado"}</td>
                        <td>{i.observation}</td>
                        <td>
                          <button
                            type="button"
                            className="catalog-edit-button"
                            aria-label={`Editar ${i.description}`}
                            disabled={busy}
                            onClick={() => {
                              setEditing({ ...i });
                              setOriginal({ ...i });
                              setError("");
                              setMessage("");
                            }}
                          >
                            <Pencil size={14} aria-hidden="true" />
                            Editar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
        <section className="manual-card">
          <h2>Importar planilha</h2>
          <p>
            Baixe o modelo XLSX e preencha a aba Itens. Até 1.000 itens e 2 MB
            por arquivo. A importação adiciona itens; não substitui o catálogo
            existente.
          </p>
          <a
            className="primary-button"
            href="/api/catalog-configuration?template=1"
          >
            Baixar planilha modelo
          </a>
          <label>
            Planilha preenchida
            <input
              type="file"
              accept=".xlsx"
              disabled={busy}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                setPreview(null);
                setError("");
                setMessage("");
                if (!file) return;
                if (file.size > 2_000_000) {
                  setError("O arquivo deve ter até 2 MB.");
                  return;
                }
                setBusy(true);
                try {
                  setPreview(
                    await api("/api/catalog-configuration?preview=1", {
                      method: "POST",
                      headers: { "Content-Type": "application/octet-stream" },
                      body: file,
                    }),
                  );
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            />
          </label>
          {preview && (
            <>
              <p>
                {preview.records.length} itens lidos · {preview.errors.length}{" "}
                erros
              </p>
              {preview.errors.length > 0 ? (
                <>
                  <p>
                    Corrija a planilha e selecione o arquivo novamente. Nenhum
                    item foi gravado.
                  </p>
                  <ul>
                    {preview.errors.slice(0, 30).map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                </>
              ) : (
                <>
                  <div className="catalog-settings-table">
                    <table>
                      <thead>
                        <tr>
                          {catalogFields.map(([, label]) => (
                            <th key={label}>{label}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {preview.records.map((r, i) => (
                          <tr key={i}>
                            {catalogFields.map(([key]) => (
                              <td key={key}>{r[key] || "—"}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button
                    className="primary-button"
                    disabled={busy}
                    onClick={() => save(preview.records)}
                  >
                    Confirmar importação de {preview.records.length} itens
                  </button>
                </>
              )}
            </>
          )}
        </section>
        <section className="manual-card">
          <h2>Adicionar item manualmente</h2>
          <p>
            Campos com * são obrigatórios. Use o mesmo fabricante, modelo e
            versão e condições para agrupar peças da mesma máquina. Informe a
            referência genuína ou o código M8.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save([form], true);
            }}
          >
            <div className="catalog-settings-fields catalog-manual-fields">
              {catalogFields.map(([key, label, required]) => (
                <label
                  key={key}
                  className={
                    key === "observation" ? "catalog-field-wide" : undefined
                  }
                >
                  {label}
                  {required &&
                  !(key === "reference" && form.internalCode) &&
                  !(key === "interval" && form.intervalUnknown === "Sim")
                    ? " *"
                    : ""}
                  {key === "observation" ? (
                    <textarea
                      rows={3}
                      maxLength={2000}
                      value={form.observation}
                      disabled={busy}
                      placeholder="Orientações e observações sobre a peça"
                      onChange={(e) =>
                        setForm((f) => ({ ...f, observation: e.target.value }))
                      }
                    />
                  ) : (
                    <input
                      required={
                        required &&
                        !(key === "reference" && form.internalCode) &&
                        !(key === "interval" && form.intervalUnknown === "Sim")
                          ? true
                          : false
                      }
                      disabled={
                        busy ||
                        (key === "serial" && form.modelOnly === "Sim") ||
                        (key === "interval" && form.intervalUnknown === "Sim")
                      }
                      maxLength={300}
                      value={form[key]}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, [key]: e.target.value }))
                      }
                      type={key === "interval" ? "number" : "text"}
                      min={key === "interval" ? 1 : undefined}
                      max={key === "interval" ? 100000 : undefined}
                      step={key === "interval" ? 1 : undefined}
                      placeholder={
                        key === "serial"
                          ? "BQD100000 ... (opcional)"
                          : key === "interval"
                            ? "4000"
                            : undefined
                      }
                    />
                  )}
                </label>
              ))}
            </div>
            <fieldset className="catalog-manual-extra">
              <legend>Aplicação e informações complementares</legend>
              <div className="catalog-settings-fields catalog-manual-fields">
                <label>
                  Controle de aplicação
                  <select
                    value={form.modelOnly || ""}
                    disabled={busy}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        modelOnly: e.target.value,
                        serial: e.target.value === "Sim" ? "" : f.serial,
                      }))
                    }
                  >
                    <option value="">Modelo e condições de série</option>
                    <option value="Sim">
                      Somente modelo (sem restrição de série)
                    </option>
                  </select>
                </label>
                <label>
                  Intervalo da manutenção
                  <select
                    value={form.intervalUnknown || ""}
                    disabled={busy}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        intervalUnknown: e.target.value,
                        interval: e.target.value === "Sim" ? "" : f.interval,
                      }))
                    }
                  >
                    <option value="">Informar em horas</option>
                    <option value="Sim">Não informado na fonte</option>
                  </select>
                </label>
                {additionalCatalogFields.map(([key, label]) => (
                  <label
                    key={key}
                    className={
                      key === "conditions" ? "catalog-field-wide" : undefined
                    }
                  >
                    {label}
                    {key === "conditions" ? (
                      <textarea
                        rows={3}
                        value={form[key] || ""}
                        maxLength={2000}
                        disabled={busy}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, [key]: e.target.value }))
                        }
                      />
                    ) : (
                      <input
                        value={form[key] || ""}
                        maxLength={300}
                        disabled={busy}
                        inputMode={
                          key === "internalCode"
                            ? "numeric"
                            : key === "quantity" || key === "saleFactor"
                              ? "decimal"
                              : "text"
                        }
                        placeholder={
                          key === "internalCode" ? "Ex.: 19273" : undefined
                        }
                        onChange={(e) =>
                          setForm((f) => ({ ...f, [key]: e.target.value }))
                        }
                      />
                    )}
                  </label>
                ))}
              </div>
            </fieldset>
            <p className="muted">
              Informe uma referência genuína ou um código M8 existente.
              Quantidade, código da vista e percentual serão preservados nas
              observações do item. O percentual não altera os preços nem calcula
              o orçamento automaticamente. As condições são compartilhadas pelos
              itens da mesma versão.
            </p>
            <div className="catalog-editor-actions">
              <button
                type="submit"
                className="catalog-save-button"
                disabled={busy}
              >
                <Plus size={16} aria-hidden="true" />
                {busy ? "Adicionando…" : "Adicionar item ao catálogo"}
              </button>
            </div>
          </form>
        </section>
        {busy && <p role="status">Processando…</p>}
      </main>
    </>
  );
}
