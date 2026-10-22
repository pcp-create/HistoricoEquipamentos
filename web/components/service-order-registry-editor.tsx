"use client";
import { useEffect, useRef, useState } from "react";
export default function ServiceOrderRegistryEditor({
  kind,
  rows,
  editing,
  onSaved,
}: {
  kind: string;
  rows: any[];
  editing?: any;
  onSaved: () => void;
}) {
  const blank = {
    id: "",
    name: "",
    active: true,
    warranty_id: "",
    warranty_description: "",
  };
  const [form, setForm] = useState(blank),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const panel = useRef<HTMLElement>(null);
  const [editingId, setEditingId] = useState("");
  function edit(row: any) {
    setForm({
      ...blank,
      ...row,
      warranty_id: row.warranty_id ?? "",
      warranty_description: row.warranty_description ?? "",
    });
    setEditingId(String(row.id));
    setError("");
  }
  useEffect(() => {
    if (!editing) return;
    edit(editing);
    panel.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    panel.current
      ?.querySelector<HTMLInputElement>('[name="warranty_id"]')
      ?.focus({ preventScroll: true });
  }, [editing]);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/registries/" + kind, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      setForm(blank);
      setEditingId("");
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="registry-panel" ref={panel}>
      <h3>
        {editingId ? `Editar cadastro — ${editingId}` : "Incluir cadastro"}
      </h3>
      <p>
        Use o ID existente no M8. Este cadastro organiza as opções do sistema;
        não cria tipos no ERP.
      </p>
      <label>
        Editar existente
        <select
          disabled={busy}
          value={editingId}
          onChange={(e) => {
            const row = rows.find((r) => r.id === e.target.value);
            if (row) edit(row);
            else {
              setForm(blank);
              setEditingId("");
              setError("");
            }
          }}
        >
          <option value="">Selecione ou preencha abaixo para cadastrar</option>
          {rows.map((r) => (
            <option key={r.id} value={r.id}>
              {r.id} · {r.name}
            </option>
          ))}
        </select>
      </label>
      <form onSubmit={save}>
        <fieldset
          disabled={busy}
          style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
        >
          <div className="registry-filters">
            <label>
              ID no M8 *
              <input
                required
                type="number"
                min="1"
                max="2147483647"
                readOnly={!!editingId}
                value={form.id}
                onChange={(e) => setForm({ ...form, id: e.target.value })}
              />
            </label>
            <label>
              Nome *
              <input
                required
                maxLength={200}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <label>
              Ativo
              <select
                value={String(form.active)}
                onChange={(e) =>
                  setForm({ ...form, active: e.target.value === "true" })
                }
              >
                <option value="true">Sim</option>
                <option value="false">Não</option>
              </select>
            </label>
            {kind === "service-types" && (
              <>
                <label>
                  ID Prazo Garantia no M8 *
                  <input
                    required
                    type="number"
                    min="1"
                    max="2147483647"
                    name="warranty_id"
                    value={form.warranty_id ?? ""}
                    onChange={(e) =>
                      setForm({ ...form, warranty_id: e.target.value })
                    }
                  />
                </label>
                <label>
                  Prazo Garantia *
                  <input
                    required
                    maxLength={500}
                    value={form.warranty_description ?? ""}
                    onChange={(e) =>
                      setForm({ ...form, warranty_description: e.target.value })
                    }
                  />
                </label>
              </>
            )}
          </div>
          {error && <p role="alert">{error}</p>}
          <button className="registry-button primary" disabled={busy}>
            {busy
              ? "Salvando…"
              : editingId
                ? "Salvar alterações"
                : "Salvar cadastro"}
          </button>
          {editingId && (
            <button
              type="button"
              className="registry-button"
              style={{ marginLeft: 8 }}
              onClick={() => {
                setForm(blank);
                setEditingId("");
                setError("");
              }}
            >
              Cancelar edição
            </button>
          )}
        </fieldset>
      </form>
    </section>
  );
}
