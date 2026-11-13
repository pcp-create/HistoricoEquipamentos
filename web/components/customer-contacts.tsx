"use client";
import { useEffect, useRef, useState } from "react";
import { formatContactPhone } from "@/lib/contact-phone";
import { contactJobLabel as contactCargo } from "@/lib/contact-job-label";
import { createPortal } from "react-dom";
import { RefreshCw, Plus, Pencil } from "lucide-react";
import "./create-linked-task.css";
import OrderSearchSelect from "./order-search-select";
import ContactJobEditor from "./contact-job-editor";
function contactPhone(phone: string) {
  return !phone || /^0+$/.test(phone.replace(/\D/g, ""))
    ? "Não informado"
    : formatContactPhone(phone);
}
const blankContact = () => ({
  name: "",
  phone: "",
  email: "",
  contact_type: "Geral",
  job_type_id: "",
  additional_phone: "",
  document: "",
  notes: "",
});
export default function CustomerContacts({
  customer,
  value = "",
  name = "",
  phone = "",
  onSelect,
  readonly = false,
}: {
  customer: string;
  value?: string;
  name?: string;
  phone?: string;
  onSelect?: (c: { id: string; name: string; phone: string }) => void;
  readonly?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const submitting = useRef(false);
  const leadName = useRef<HTMLInputElement>(null);
  const [jobTypes, setJobTypes] = useState<any[]>([]);
  const [jobTypesError, setJobTypesError] = useState("");
  const [editingCargo, setEditingCargo] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [rows, setRows] = useState<any[]>([]),
    [adding, setAdding] = useState(false),
    [draft, setDraft] = useState(blankContact()),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    setRows([]);
    setEditingCargo(false);
    setDraft(blankContact());
    setAdding(!customer && !readonly);
    setError("");
    if (!customer) return;
    const c = new AbortController();
    fetch("/api/customer-contacts?customer=" + encodeURIComponent(customer), {
      signal: c.signal,
    })
      .then(async (r) => {
        const b = await r.json();
        if (!r.ok) throw Error(b.error);
        setRows(b.contacts);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => c.abort();
  }, [customer, readonly, refresh]);
  useEffect(() => {
    if (adding && customer) dialog.current?.showModal();
  }, [adding, customer]);
  useEffect(() => {
    if (!adding || !customer.startsWith("m8:")) return;
    const c = new AbortController();
    setJobTypes([]);
    setJobTypesError("");
    fetch("/api/contact-job-types", { signal: c.signal, cache: "no-store" })
      .then(async (r) => {
        const b = await r.json();
        if (!r.ok) throw Error(b.error);
        if (!c.signal.aborted) setJobTypes(b.rows || []);
      })
      .catch((e) => {
        if (!c.signal.aborted) setJobTypesError(e.message);
      });
    return () => c.abort();
  }, [adding, customer]);
  async function add() {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/customer-contacts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ customer, ...draft }),
        }),
        b = await r.json();
      if (!r.ok) throw Error(b.error);
      setRows((old) => [
        ...old.filter((x) => x.id !== b.contact.id),
        b.contact,
      ]);
      onSelect?.(b.contact);
      setAdding(false);
      setDraft(blankContact());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  const selectedContact = rows.find((c) => c.id === value);
  return (
    <section className="visit-contacts">
      <div className="visit-contacts-heading">
        <strong>
          {readonly ? "Contatos do cliente" : "Contato que receberá a visita"}
        </strong>
        <div className="visit-contact-actions">
          {customer && (
            <button
              type="button"
              disabled={busy || adding || editingCargo}
              onClick={() => setRefresh((v) => v + 1)}
            >
              <RefreshCw size={15} aria-hidden="true" />
              Atualizar contatos
            </button>
          )}
          {(!adding || (!customer && !readonly)) && (
            <button
              type="button"
              disabled={editingCargo}
              className="visit-contact-new-button"
              aria-label="+ Novo contato"
              onClick={() => {
                setAdding(true);
                setError("");
                leadName.current?.focus();
              }}
            >
              <Plus size={16} aria-hidden="true" />
              Novo contato
            </button>
          )}
        </div>
      </div>
      {error && !adding && <p role="alert">{error}</p>}
      {readonly ? (
        <ul>
          {rows.map((c) => (
            <li key={c.id}>
              {c.name}
              {contactCargo(c) ? ` · ${contactCargo(c)}` : ""} ·{" "}
              <a href={"tel:" + c.phone}>{c.phone}</a>
            </li>
          ))}
          {!rows.length && <li>Nenhum contato cadastrado.</li>}
        </ul>
      ) : (
        (!!customer || !adding) && (
          <>
            <div className="customer-contact-picker">
              <OrderSearchSelect
                label="Contato que receberá a visita"
                required
                value={value || (name ? "legacy" : "")}
                selectedLabel={selectedContact?.name || name}
                placeholder="Selecione o contato"
                searchPlaceholder="Pesquisar por nome, cargo, telefone ou e-mail"
                options={[
                  ...(name && !value
                    ? [
                        {
                          id: "legacy",
                          displayId: "",
                          name,
                          detail: `Telefone: ${contactPhone(phone)} • E-mail: Não informado`,
                          data: { id: "", name, phone },
                        },
                      ]
                    : []),
                  ...rows.map((c) => ({
                    id: c.id,
                    displayId: "",
                    name: c.name,
                    detail: `Cargo: ${contactCargo(c) || "Não informado"} • Telefone: ${contactPhone(c.phone)} • E-mail: ${c.email?.trim() || "Não informado"}`,
                    data: c,
                  })),
                ]}
                onChange={(row) => onSelect?.(row.data)}
              />
            </div>
            {(selectedContact || name) && (
              <div className="customer-contact-summary">
                <small>
                  <strong className="contact-cargo-label">
                    Cargo

                  </strong>
                  {contactCargo(selectedContact) || "Não informado"}
                </small>
                <small>
                  <strong>Telefone</strong>
                  {contactPhone(selectedContact?.phone||phone)}
                </small>
                <small><strong>E-mail</strong>{selectedContact?.email?.trim() || "Não informado"}</small>
                    {selectedContact && (
                      <button
                        type="button"
                        className="contact-cargo-edit"
                        aria-label="Editar contato"
                        title="Editar contato"
                        disabled={busy || adding}
                        onClick={() => setEditingCargo(true)}
                      >
                        <Pencil size={14} aria-hidden="true" />
                      </button>
                    )}
              </div>
            )}
          </>
        )
      )}
      {adding && !customer && (
        <div className="visit-contact-new">
          <label>
            Nome do contato
            <input
              ref={leadName}
              aria-label="Nome do contato"
              required
              maxLength={160}
              value={customer ? draft.name : name}
              onChange={(e) =>
                customer
                  ? setDraft({ ...draft, name: e.target.value })
                  : onSelect?.({ id: "", name: e.target.value, phone })
              }
            />
          </label>
          <label>
            Telefone do contato
            <input
              aria-label="Telefone do contato"
              required
              type="tel"
              inputMode="tel"
              placeholder="(DD) 99999-9999"
              maxLength={40}
              value={formatContactPhone(customer ? draft.phone : phone)}
              onChange={(e) =>
                customer
                  ? setDraft({
                      ...draft,
                      phone: formatContactPhone(e.target.value),
                    })
                  : onSelect?.({
                      id: "",
                      name,
                      phone: formatContactPhone(e.target.value),
                    })
              }
            />
          </label>
          {customer ? (
            <>
              <button
                type="button"
                disabled={
                  busy ||
                  !draft.name.trim() ||
                  !draft.phone.trim() ||
                  (customer.startsWith("m8:") && !draft.job_type_id)
                }
                onClick={() => void add()}
              >
                Salvar contato
              </button>
              <button type="button" onClick={() => setAdding(false)}>
                Cancelar
              </button>
            </>
          ) : (
            <small>
              O contato será cadastrado junto com o novo Lead ao salvar a
              visita.
            </small>
          )}
        </div>
      )}
      {adding &&
        customer &&
        createPortal(
          <dialog
            ref={dialog}
            className="linked-task-dialog customer-contact-dialog"
            aria-label="Novo contato"
            onCancel={(e) => {
              if (busy) e.preventDefault();
              else setAdding(false);
            }}
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void add();
              }}
            >
              <h2>Novo contato</h2>
              <p>
                {customer.startsWith("m8:")
                  ? "O contato será cadastrado no ERP M8 e ficará disponível para as visitas."
                  : "Salve o contato para continuar o agendamento da visita."}
              </p>
              {error && <p role="alert">{error}</p>}
              <label>
                Nome do contato
                <input
                  autoFocus
                  required
                  maxLength={160}
                  value={draft.name}
                  disabled={busy}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </label>
              <label>
                Telefone do contato
                <input
                  required
                  type="tel"
                  inputMode="tel"
                  placeholder="(DD) 99999-9999"
                  maxLength={40}
                  value={draft.phone}
                  disabled={busy}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      phone: formatContactPhone(e.target.value),
                    })
                  }
                />
              </label>
              {customer.startsWith("m8:") && (
                <>
                  <label>
                    E-mail do contato
                    <input
                      required
                      type="email"
                      maxLength={254}
                      disabled={busy}
                      value={draft.email}
                      onChange={(e) =>
                        setDraft({ ...draft, email: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Cargo do contato
                    <select
                      required
                      disabled={busy || !jobTypes.length}
                      value={draft.job_type_id}
                      onChange={(e) =>
                        setDraft({ ...draft, job_type_id: e.target.value })
                      }
                    >
                      <option value="">Selecione o cargo</option>
                      {jobTypes.map((j) => (
                        <option key={j.id} value={j.id}>
                          {j.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {jobTypesError && <p role="alert">{jobTypesError}</p>}
                  {!jobTypes.length && (
                    <small>
                      Cadastre um cargo ativo em{" "}
                      <a
                        href="/configuracoes/cadastros/tipos-cargo"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Tipos de Cargo
                      </a>{" "}
                      e reabra esta janela para atualizar a lista.
                    </small>
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
                      onChange={(e) =>
                        setDraft({ ...draft, document: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Observação
                    <textarea
                      maxLength={2000}
                      disabled={busy}
                      value={draft.notes}
                      onChange={(e) =>
                        setDraft({ ...draft, notes: e.target.value })
                      }
                    />
                  </label>
                </>
              )}
              <footer>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setAdding(false);
                    setError("");
                    setDraft(blankContact());
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={
                    busy ||
                    !draft.name.trim() ||
                    !draft.phone.trim() ||
                    (customer.startsWith("m8:") && !draft.job_type_id)
                  }
                >
                  {busy ? "Salvando…" : "Salvar contato"}
                </button>
              </footer>
            </form>
          </dialog>,
          document.body,
        )}
      {editingCargo && selectedContact && (
        <ContactJobEditor
          customer={customer}
          contact={selectedContact}
          onClose={() => setEditingCargo(false)}
          onSaved={(row) => {
            setRows((old) =>
              old.map((c) => (c.id === row.id ? { ...c, ...row } : c)),
            );
            onSelect?.(row);
            setEditingCargo(false);
          }}
        />
      )}
    </section>
  );
}
