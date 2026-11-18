"use client";
import ActionNotice from "./action-notice";
import { useEffect, useState } from "react";
import Link from "next/link";
import SiteHeader from "./site-header";
import ContactJobEditor from "./contact-job-editor";
import "./registries.css";
export default function ContactSyncPending() {
  const [rows, setRows] = useState<any[]>([]),
    [editing, setEditing] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [search, setSearch] = useState("");
  async function load() {
    try {
      const r = await fetch("/api/contact-sync", { cache: "no-store" }),
        b = await r.json();
      if (!r.ok) throw Error(b.error);
      setRows(b.rows);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 15000);
    return () => clearInterval(timer);
  }, []);
  async function retry(id: string) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/contact-sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        }),
        b = await r.json();
      if (!r.ok) throw Error(b.error);
      setMessage(
        "Conferência solicitada. A lista será atualizada automaticamente.",
      );
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <SiteHeader active="registries" />
      <main className="registry-main">
        <Link href="/configuracoes/cadastros">Voltar aos cadastros</Link>
        <h1>Pendências de sincronização com o M8</h1>
        <p>
          Os contatos continuam disponíveis no sistema. Corrija cada pendência e
          solicite uma nova conferência.
        </p>
        <p>
          Alterações de contatos já existentes precisam ser ajustadas no M8. A
          conferência compara os dados antes de marcar como migrado.
        </p>
        <input
          aria-label="Pesquisar pendências"
          placeholder="Cliente, contato, telefone ou e-mail"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button onClick={() => void load()} disabled={busy}>
          Atualizar
        </button>
        {error && <ActionNotice type="error" onClose={()=>setError('')}>{error}</ActionNotice>}
        {message && <ActionNotice type="success" onClose={()=>setMessage('')}>{message}</ActionNotice>}
        <p>{rows.length} contato(s) pendente(s)</p>
        {rows
          .filter((r) =>
            [r.customer_name, r.name, r.phone, r.email]
              .join(" ")
              .toLocaleLowerCase()
              .includes(search.toLocaleLowerCase()),
          )
          .map((row) => (
            <article
              key={row.id}
              style={{
                padding: 20,
                marginBottom: 16,
                border: "1px solid #ccd7e4",
                borderRadius: 12,
              }}
            >
              <h2>{row.name} · Pendente</h2>
              <p>
                {row.customer_name || row.customer_key} · {row.phone} ·{" "}
                {row.email || "Sem e-mail"}
              </p>
              <p>
                {row.m8_id ? "Contato M8: " + row.m8_id : "Inclusão de contato"}{" "}
                · {row.job_title}
              </p>
              <p>{row.sync_error || "Aguardando sincronização."}</p>
              {row.sync_attempted_at && (
                <small>
                  Última tentativa:{" "}
                  {new Date(row.sync_attempted_at).toLocaleString("pt-BR", {
                    timeZone: "America/Sao_Paulo",
                  })}
                </small>
              )}
              <div>
                <button disabled={busy} onClick={() => setEditing(row)}>
                  Corrigir contato
                </button>
                <button disabled={busy} onClick={() => void retry(row.id)}>
                  {row.m8_id ? "Conferir no M8" : "Tentar sincronizar"}
                </button>
              </div>
            </article>
          ))}
        {editing && (
          <ContactJobEditor
            customer={editing.customer_key}
            contact={editing}
            onClose={() => setEditing(null)}
            onDeleted={()=>{setEditing(null); void load();}}
            onSaved={() => {
              setEditing(null);
              void load();
            }}
          />
        )}
      </main>
    </>
  );
}
