"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { Plus, Pencil, X, CheckCircle2, XCircle } from "lucide-react";
import SiteHeader from "./site-header";
import "./registries.css";
import "./crm.css";
async function api(body?: unknown) {
  const r = await fetch(
    "/api/contact-job-types" + (body ? "" : "?all=1"),
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : { cache: "no-store" },
  );
  const b = await r.json();
  if (!r.ok) throw Error(b.error);
  return b;
}
export default function ContactJobTypes() {
  const [rows, setRows] = useState<any[] | null>(null),
    [editing, setEditing] = useState<any>(null),
    [error, setError] = useState("");
  async function load() {
    setRows((await api()).rows);
  }
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, []);
  return (
    <>
      <SiteHeader active="registries" />
      <main className="main crm-main">
        <Link href="/configuracoes/cadastros">Todos os cadastros</Link>
        <header className="crm-heading">
          <div>
            <h1>Tipos de Cargo</h1>
            <p>
              Defina os nomes dos cargos e seus IDs no ERP M8 para o cadastro de
              contatos.
            </p>
          </div>
          <button className="button primary" onClick={() => setEditing({})}>
            <Plus size={16} />
            Novo cargo
          </button>
        </header>
        {error && (
          <p role="alert" className="crm-error">
            {error}
          </p>
        )}
        {!rows ? (
          <p>Carregando cargos…</p>
        ) : (
          <section className="results-panel">
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Descrição</th>
                    <th>ID do cargo no M8</th>
                    <th>Usuário M8</th>
                    <th>Ativo?</th>
                    <th>Excluído?</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td>{r.name}</td>
                      <td>{r.m8_id}</td>
                      <td>{r.m8_user_id ?? "—"}</td>
                      <td><JobStatus value={r.active} positive={r.active}/></td>
                      <td><JobStatus value={r.excluded} positive={!r.excluded}/></td>
                      <td>
                        {r.excluded ? (
                          "—"
                        ) : (
                          <button
                            className="button"
                            aria-label={"Editar " + r.name}
                            onClick={() => setEditing(r)}
                          >
                            <Pencil size={15} />
                            Editar
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!rows.length && (
                    <tr>
                      <td colSpan={6}>Nenhum cargo cadastrado.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>
      {editing && (
        <JobDialog
          row={editing}
          close={() => setEditing(null)}
          saved={async () => {
            await load();
            setEditing(null);
          }}
        />
      )}
    </>
  );
}
function JobDialog({
  row,
  close,
  saved,
}: {
  row: any;
  close: () => void;
  saved: () => Promise<void>;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    sending = useRef(false),
    [name, setName] = useState(row.name || ""),
    [m8, setM8] = useState(String(row.m8_id || "")),
    [active, setActive] = useState(row.active ?? true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    const el = ref.current!;
    el.showModal();
    return () => el.close();
  }, []);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setError("");
    try {
      await api({ id: row.id, version: row.version, name, m8_id: m8, active });
      await saved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  return createPortal(
    <dialog
      ref={ref}
      className="crm-dialog"
      aria-label="Tipo de cargo"
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else close();
      }}
    >
      <header>
        <h2>{row.id ? "Editar cargo" : "Novo cargo"}</h2>
        <button
          type="button"
          className="button"
          aria-label="Fechar cadastro"
          disabled={busy}
          onClick={close}
        >
          <X size={20} />
        </button>
      </header>
      <form onSubmit={save}>
        <fieldset disabled={busy} style={{ border: 0, padding: 0 }}>
          <div className="crm-form-grid">
            <label>
              Descrição
              <input
                autoFocus
                required
                maxLength={160}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label>
              ID do cargo no M8
              <input
                required
                inputMode="numeric"
                pattern="[0-9]+"
                maxLength={10}
                value={m8}
                onChange={(e) => setM8(e.target.value)}
              />
            </label>
            <label>
              Ativo?
              <select
                value={active ? "yes" : "no"}
                onChange={(e) => setActive(e.target.value === "yes")}
              >
                <option value="yes">Sim</option>
                <option value="no">Não</option>
              </select>
            </label>
          </div>
          {error && (
            <p role="alert" className="crm-error">
              {error}
            </p>
          )}
          <button type="submit" className="button primary">
            {busy ? "Salvando…" : "Salvar cargo"}
          </button>
        </fieldset>
      </form>
    </dialog>,
    document.body,
  );
}

function JobStatus({value,positive}:{value:boolean;positive:boolean}){
 return <span className={positive?'registry-active':'registry-inactive'} style={positive?undefined:{color:'#bb263b'}}>{positive?<CheckCircle2 size={16} aria-hidden="true"/>:<XCircle size={16} aria-hidden="true"/>}{value?'Sim':'Não'}</span>;
}
