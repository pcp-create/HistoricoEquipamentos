"use client";
import { useEffect, useState } from "react";
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
  const [rows, setRows] = useState<any[]>([]),
    [adding, setAdding] = useState(false),
    [draft, setDraft] = useState({ name: "", phone: "" }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    setRows([]);
    setDraft({ name: "", phone: "" });
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
  }, [customer, readonly]);
  async function add() {
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
      setDraft({ name: "", phone: "" });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="visit-contacts">
      <strong>
        {readonly ? "Contatos do cliente" : "Contato que receberá a visita"}
      </strong>
      {error && <p role="alert">{error}</p>}
      {readonly ? (
        <ul>
          {rows.map((c) => (
            <li key={c.id}>
              {c.name} · <a href={"tel:" + c.phone}>{c.phone}</a>
            </li>
          ))}
          {!rows.length && <li>Nenhum contato cadastrado.</li>}
        </ul>
      ) : (
        (!!customer || !adding) && (
          <>
            <select
              aria-label="Contato que receberá a visita"
              required
              value={value || (name ? "legacy" : "")}
              onChange={(e) => {
                const c = rows.find((x) => x.id === e.target.value);
                onSelect?.(c || { id: "", name: "", phone: "" });
              }}
            >
              <option value="">Selecione o contato</option>
              {name && !value && (
                <option value="legacy">
                  {name} - {phone}
                </option>
              )}
              {rows.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} - {c.phone}
                </option>
              ))}
            </select>
            {phone && <small>Telefone: {phone}</small>}
          </>
        )
      )}
      {!adding && (
        <button
          type="button"
          onClick={() => {
            setAdding(true);
            if (!readonly) onSelect?.({ id: "", name: "", phone: "" });
          }}
        >
          + Novo contato
        </button>
      )}
      {adding && (
        <div className="visit-contact-new">
          <label>
            Nome do contato
            <input
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
              maxLength={40}
              value={customer ? draft.phone : phone}
              onChange={(e) =>
                customer
                  ? setDraft({ ...draft, phone: e.target.value })
                  : onSelect?.({ id: "", name, phone: e.target.value })
              }
            />
          </label>
          {customer ? (
            <>
              <button
                type="button"
                disabled={busy || !draft.name.trim() || !draft.phone.trim()}
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
    </section>
  );
}
