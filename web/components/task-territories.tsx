"use client";
import { useEffect, useState } from "react";
import { apiFetch, clearApiCache } from "@/lib/client-api-cache";
const empty = {
  id: null as string | null,
  version: 0,
  city: "",
  mesoregion: "",
  microregion: "",
  seller: "",
  uf: "SC",
  assignee: "",
};
export default function TaskTerritories() {
  const [data, setData] = useState<any>(null),
    [form, setForm] = useState(empty),
    [editing, setEditing] = useState(false),
    [query, setQuery] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  async function load() {
    const r = await apiFetch("/api/task-territories");
    const b = await r.json();
    if (!r.ok) throw Error(b.error);
    setData(b);
  }
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, []);
  async function save(body: any) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await apiFetch("/api/task-territories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const b = await r.json();
      if (!r.ok) throw Error(b.error);
      setEditing(false);
      setForm(empty);
      await load();
      setMessage(
        "Divisão comercial atualizada. A regra será usada nas novas tarefas.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const fold = (v: string) =>
    v
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const rows = (data?.rules || []).filter((r: any) =>
    fold(
      `${r.city} ${r.mesoregion || ""} ${r.microregion || ""} ${r.seller || ""} ${r.uf} ${r.display_name}`,
    ).includes(fold(query)),
  );
  return (
    <section className="manual-card">
      <h2>Divisão comercial por cidade e UF</h2>
      <p>
        Define o orçamentista das novas tarefas de Preventiva de Equipamento de
        Cliente. Alterações não redistribuem tarefas existentes. Clientes com
        localização ausente ou vínculos conflitantes ficam sem atribuição
        automática.
      </p>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <div className="territory-toolbar">
        <button
          disabled={busy}
          onClick={() => {
            setForm(empty);
            setEditing(true);
          }}
        >
          Nova regra
        </button>
        <button
          disabled={busy}
          onClick={() => {
            clearApiCache();
            void load().catch((e) => setError(e.message));
          }}
        >
          Atualizar divisão
        </button>
      </div>
      {editing && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save({ ...form, action: "save" });
          }}
        >
          <div className="territory-toolbar">
            <label>
              Cidade
              <input
                required
                maxLength={150}
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
              />
            </label>
            {(
              [
                ["mesoregion", "Mesorregião"],
                ["microregion", "Microrregião"],
                ["seller", "Vendedor"],
              ] as const
            ).map(([field, label]) => (
              <label key={field}>
                {label}
                <input
                  maxLength={150}
                  value={form[field]}
                  onChange={(e) =>
                    setForm({ ...form, [field]: e.target.value })
                  }
                />
              </label>
            ))}
            <label>
              Estado
              <select
                value={form.uf}
                onChange={(e) => setForm({ ...form, uf: e.target.value })}
              >
                {"AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO"
                  .split(" ")
                  .map((uf) => (
                    <option key={uf}>{uf}</option>
                  ))}
              </select>
            </label>
            <label htmlFor="territory-assignee">
              Orçamentista
              <select
                id="territory-assignee"
                required
                value={form.assignee}
                onChange={(e) => setForm({ ...form, assignee: e.target.value })}
              >
                <option value="">Selecione</option>
                {form.assignee &&
                  !data?.users.some((u: any) => u.email === form.assignee) && (
                    <option value={form.assignee}>
                      Responsável inativo — selecione outro
                    </option>
                  )}
                {data?.users.map((u: any) => (
                  <option key={u.email} value={u.email}>
                    {u.display_name || "Usuário sem nome cadastrado"}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button disabled={busy} type="submit">
            Salvar regra
          </button>{" "}
          <button
            disabled={busy}
            type="button"
            onClick={() => setEditing(false)}
          >
            Cancelar
          </button>
        </form>
      )}
      <label>
        Pesquisar divisão
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cidade, região, vendedor, estado ou orçamentista"
        />
      </label>
      <p>{rows.length} regras</p>
      <div style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Cidade</th>
              <th>Mesorregião</th>
              <th>Microrregião</th>
              <th>Vendedor</th>
              <th>Estado</th>
              <th>Orçamentista</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r: any) => (
              <tr key={r.id}>
                <td>{r.city}</td>
                <td>{r.mesoregion || "—"}</td>
                <td>{r.microregion || "—"}</td>
                <td>{r.seller || "—"}</td>
                <td>{r.uf}</td>
                <td>
                  {r.display_name || "Usuário sem nome cadastrado"}
                  {!r.enabled ? " (inativo)" : ""}
                </td>
                <td>
                  <button
                    disabled={busy}
                    onClick={() => {
                      setForm({
                        id: r.id,
                        version: r.version,
                        city: r.city,
                        mesoregion: r.mesoregion || "",
                        microregion: r.microregion || "",
                        seller: r.seller || "",
                        uf: r.uf,
                        assignee: r.assignee,
                      });
                      setEditing(true);
                    }}
                  >
                    Editar
                  </button>{" "}
                  <button
                    disabled={busy}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Remover a regra de ${r.city}/${r.uf}? As tarefas existentes serão mantidas.`,
                        )
                      )
                        void save({
                          action: "delete",
                          id: r.id,
                          version: r.version,
                        });
                    }}
                  >
                    Remover
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
