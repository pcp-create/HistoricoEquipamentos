"use client";
import SaveActionIcon from "./save-action-icon";
import { useEffect, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { apiFetch, clearApiCache } from "@/lib/client-api-cache";
import "./compact-edit-table.css";
const empty = {
  id: null,
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
    [query, setQuery] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [adding, setAdding] = useState(false);
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
    if (busy) return false;
    const before = data;
    setBusy(true);
    setError("");
    setMessage("");
    const temp = {
      ...body,
      id: body.id || "new",
      display_name: data.users.find((u: any) => u.email === body.assignee)
        ?.display_name,
      enabled: true,
    };
    setData({
      ...data,
      rules:
        body.action === "delete"
          ? data.rules.filter((r: any) => r.id !== body.id)
          : body.id
            ? data.rules.map((r: any) => (r.id === body.id ? temp : r))
            : data.rules,
    });
    try {
      const r = await apiFetch("/api/task-territories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const b = await r.json();
      if (!r.ok) throw Error(b.error);
      await load();
      setMessage(
        "Divisão comercial atualizada. A regra será usada nas novas tarefas.",
      );
      return true;
    } catch (e) {
      setData(before);
      setError((e as Error).message);
      return false;
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
      `${r.city} ${r.mesoregion || ""} ${r.microregion || ""} ${r.seller || ""} ${r.uf} ${r.display_name || ""}`,
    ).includes(fold(query)),
  );
  return (
    <section className="manual-card">
      <h2>Divisão comercial por cidade e UF</h2>
      <p>
        Define o orçamentista das novas tarefas de Preventiva de Equipamento de
        Cliente. Alterações não redistribuem tarefas existentes. Edite na linha
        e pressione Enter ou Salvar.
      </p>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <div className="territory-toolbar">
        <label>
          Pesquisar divisão
          <input
            placeholder="Cidade, região, vendedor, estado ou orçamentista"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
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
      <p>{rows.length} regras</p>
      <div className="compact-edit-wrap">
        <table className="compact-edit-table">
          <thead>
            <tr>
              {[
                "Cidade",
                "Mesorregião",
                "Microrregião",
                "Vendedor",
                "Estado",
                "Orçamentista",
                "Ações",
              ].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r: any) => (
              <TerritoryRow
                key={r.id}
                row={r}
                users={data.users}
                busy={busy}
                save={save}
              />
            ))}
            {adding && (
              <TerritoryRow
                row={empty}
                users={data?.users || []}
                busy={busy}
                save={async (b: any) => {
                  const ok = await save(b);
                  if (ok) setAdding(false);
                  return ok;
                }}
                cancel={() => setAdding(false)}
              />
            )}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={7}>
                <button
                  disabled={!data || busy || adding}
                  onClick={() => setAdding(true)}
                >
                  <Plus size={15} />
                  Adicionar regra
                </button>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
function TerritoryRow({ row, users, busy, save, cancel }: any) {
  const normalize = (r: any) => ({
    ...empty,
    ...r,
    mesoregion: r.mesoregion || "",
    microregion: r.microregion || "",
    seller: r.seller || "",
  });
  const [d, setD] = useState(() => normalize(row));
  useEffect(() => setD(normalize(row)), [row.version]);
  const fields = [
    "city",
    "mesoregion",
    "microregion",
    "seller",
    "uf",
    "assignee",
  ];
  const dirty = !row.id || fields.some((k) => d[k] !== normalize(row)[k]);
  const persist = () => {
    if (!busy && dirty && d.city.trim() && d.assignee)
      void save({ ...d, action: "save" });
  };
  return (
    <tr
      className={dirty ? "compact-edit-dirty" : ""}
      onKeyDown={(e) => {
        if (
          e.key === "Enter" &&
          !e.nativeEvent.isComposing &&
          !(e.target instanceof HTMLButtonElement)
        ) {
          e.preventDefault();
          persist();
        }
      }}
    >
      {["city", "mesoregion", "microregion", "seller"].map((key, i) => (
        <td key={key}>
          <input
            aria-label={`${["Cidade", "Mesorregião", "Microrregião", "Vendedor"][i]} ${row.city || "nova regra"}`}
            maxLength={150}
            value={d[key]}
            disabled={busy}
            onChange={(e) => setD({ ...d, [key]: e.target.value })}
          />
          {i === 0 && dirty && <small>Alterações não salvas</small>}
        </td>
      ))}
      <td>
        <select
          aria-label={`Estado ${row.city || "nova regra"}`}
          value={d.uf}
          disabled={busy}
          onChange={(e) => setD({ ...d, uf: e.target.value })}
        >
          {"AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO"
            .split(" ")
            .map((uf) => (
              <option key={uf}>{uf}</option>
            ))}
        </select>
      </td>
      <td>
        <select
          aria-label={`Orçamentista ${row.city || "nova regra"}`}
          value={d.assignee}
          disabled={busy}
          onChange={(e) => setD({ ...d, assignee: e.target.value })}
        >
          <option value="">Selecione</option>
          {d.assignee && !users.some((u: any) => u.email === d.assignee) && (
            <option value={d.assignee}>
              Responsável inativo — selecione outro
            </option>
          )}
          {users.map((u: any) => (
            <option key={u.email} value={u.email}>
              {u.display_name || "Usuário sem nome cadastrado"}
            </option>
          ))}
        </select>
      </td>
      <td>
        <button
          disabled={busy || !dirty || !d.city.trim() || !d.assignee}
          onClick={persist}
         aria-label="Salvar" title="Salvar"><SaveActionIcon /></button>
        {dirty && (
          <button
            disabled={busy}
            onClick={() => (cancel ? cancel() : setD(normalize(row)))}
          >
            <X size={14} />
            Cancelar
          </button>
        )}
        {row.id && (
          <button
            disabled={busy}
            aria-label={`Remover regra de ${row.city}`}
            onClick={() => {
              if (
                window.confirm(
                  `Remover a regra de ${row.city}/${row.uf}? As tarefas existentes serão mantidas.`,
                )
              )
                void save({
                  action: "delete",
                  id: row.id,
                  version: row.version,
                });
            }}
          >
            <Trash2 size={14} />
          </button>
        )}
      </td>
    </tr>
  );
}
