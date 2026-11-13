"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatContactPhone } from "@/lib/contact-phone";
import { X } from "lucide-react";
export default function ContactJobEditor({
  customer,
  contact,
  onClose,
  onSaved,
}: {
  customer: string;
  contact: any;
  onClose: () => void;
  onSaved: (row: any) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    sending = useRef(false);
  const [draft, setDraft] = useState({
    name: contact.name || "",
    phone: contact.phone || "",
    email: contact.email || "",
    additional_phone: contact.additional_phone || "",
    document: contact.document || "",
    notes: contact.notes || "",
  });
  const [rows, setRows] = useState<any[]>([]),
    [selected, setSelected] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    const el = dialog.current!;
    el.showModal();
    return () => el.close();
  }, []);
  useEffect(() => {
    const c = new AbortController();
    fetch("/api/contact-job-types", { signal: c.signal, cache: "no-store" })
      .then(async (r) => {
        const b = await r.json();
        if (!r.ok) throw Error(b.error);
        if (c.signal.aborted) return;
        setRows(b.rows || []);
        setSelected(
          String(
            b.rows?.find(
              (j: any) =>
                String(j.id) === String(contact.job_type_id) ||
                Number(j.m8_id) === Number(contact.cargo_id),
            )?.id || "",
          ),
        );
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [contact]);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (sending.current || !draft.name.trim()) return;
    sending.current = true;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/customer-contacts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer,
          ...draft,
          contactId: contact.id,
          jobTypeId: selected,
          version: contact.job_version,
        }),
      });
      const b = await r.json();
      if (!r.ok) throw Error(b.error);
      onSaved(b.contact);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  return createPortal(
    <dialog
      ref={dialog}
      className="linked-task-dialog customer-contact-dialog"
      aria-label="Editar contato"
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else onClose();
      }}
    >
      <header>
        <h2>Editar contato</h2>
        <button
          type="button"
          aria-label="Fechar edição do contato"
          disabled={busy}
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </header>
      <p>{contact.name}</p>
      <p>
        As alterações serão salvas no sistema. Uma tarefa será encaminhada ao
        responsável pelo vínculo manual de equipamentos para ajustar o cadastro
        no M8.
      </p>
      <form onSubmit={save}>
        <label>
          Nome do contato
          <input
            required
            maxLength={160}
            disabled={busy}
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </label>
        <label>
          Telefone do contato
          <input
            type="tel"
            maxLength={40}
            disabled={busy}
            value={draft.phone}
            onChange={(e) =>
              setDraft({ ...draft, phone: formatContactPhone(e.target.value) })
            }
          />
        </label>
        <label>
          E-mail do contato
          <input
            type="email"
            maxLength={254}
            disabled={busy}
            value={draft.email}
            onChange={(e) => setDraft({ ...draft, email: e.target.value })}
          />
        </label>
        <label>
          Cargo do contato
          <select
            disabled={busy || loading}
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">
              {loading ? "Carregando cargos…" : "Selecione o cargo"}
            </option>
            {rows.map((j) => (
              <option key={j.id} value={j.id}>
                {j.name}
              </option>
            ))}
          </select>
        </label>
        {!loading && !rows.length && (
          <p>
            Cadastre um cargo ativo em{" "}
            <a
              href="/configuracoes/cadastros/tipos-cargo"
              target="_blank"
              rel="noreferrer"
            >
              Tipos de Cargo
            </a>{" "}
            e reabra esta janela.
          </p>
        )}
        <label>
          Telefone adicional
          <input
            type="tel"
            maxLength={40}
            disabled={busy}
            value={draft.additional_phone}
            onChange={(e) =>
              setDraft({
                ...draft,
                additional_phone: formatContactPhone(e.target.value),
              })
            }
          />
        </label>
        <label>
          CPF/CNPJ do contato
          <input
            maxLength={20}
            disabled={busy}
            value={draft.document}
            onChange={(e) => setDraft({ ...draft, document: e.target.value })}
          />
        </label>
        <label>
          Observação
          <textarea
            maxLength={2000}
            disabled={busy}
            value={draft.notes}
            onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <footer>
          <button type="button" disabled={busy} onClick={onClose}>
            Cancelar
          </button>
          <button
            type="submit"
            disabled={busy || loading || !draft.name.trim()}
          >
            {busy ? "Salvando…" : "Salvar contato"}
          </button>
        </footer>
      </form>
    </dialog>,
    document.body,
  );
}
