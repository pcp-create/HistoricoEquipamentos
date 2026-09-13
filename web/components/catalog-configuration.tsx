"use client";
import { useEffect, useState } from "react";
import SiteHeader from "./site-header";
import {
  blankCatalogRecord,
  catalogFields,
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
        }));
      else setPreview(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const selected = versions.find((v) => v.id === version);
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
              <div className="catalog-settings-table">
                <table>
                  <thead>
                    <tr>
                      {[
                        "Grupo",
                        "Descrição",
                        "Referência genuína",
                        "Intervalo informado",
                        "Observações",
                      ].map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((i) => (
                      <tr key={i.id}>
                        <td>{i.section}</td>
                        <td>{i.description}</td>
                        <td>{i.code_original}</td>
                        <td>{i.interval_original || "Não informado"}</td>
                        <td>{i.observation}</td>
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
            versão para agrupar peças da mesma máquina. Séries diferentes
            precisam de versões distintas.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save([form], true);
            }}
          >
            <div className="catalog-settings-fields">
              {catalogFields.map(([key, label, required]) => (
                <label key={key}>
                  {label}
                  {required ? " *" : ""}
                  <input
                    required={required}
                    maxLength={key === "observation" ? 2000 : 300}
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
                </label>
              ))}
            </div>
            <p className="muted">
              Intervalo em horas inteiras. Referência com 6 a 24 letras/dígitos,
              contendo ao menos um número. Sem faixa de série, a aplicação
              precisa ser conferida pelo usuário.
            </p>
            <button className="primary-button" disabled={busy}>
              Adicionar item ao catálogo
            </button>
          </form>
        </section>
        {busy && <p role="status">Processando…</p>}
      </main>
    </>
  );
}
