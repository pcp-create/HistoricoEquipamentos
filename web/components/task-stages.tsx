"use client";
import { useEffect, useState, useRef } from "react";
import { Plus, Trash2, GripVertical, ArrowUp, ArrowDown } from "lucide-react";
import { apiFetch, clearApiCache } from "@/lib/client-api-cache";
export default function TaskStages() {
  const [data, setData] = useState<any>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [adding, setAdding] = useState<string | null>(null);
  const [newRole, setNewRole] = useState("");
  const [dragging, setDragging] = useState<string | null>(null);
  const dataRef = useRef<any>(null),
    savingRef = useRef(false);
  dataRef.current = data;
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  function cancelAuto(formId: string) {
    const timer = timers.current.get(formId);
    if (timer) clearTimeout(timer);
    timers.current.delete(formId);
  }
  function scheduleAuto(formId: string, rowId?: string, delay = 800) {
    cancelAuto(formId);
    timers.current.set(
      formId,
      setTimeout(() => {
        timers.current.delete(formId);
        void autoSave(formId, rowId);
      }, delay),
    );
  }
  async function autoSave(formId: string, rowId?: string) {
    const form = document.getElementById(formId) as HTMLFormElement | null;
    if (!form) return;
    if (savingRef.current) {
      scheduleAuto(formId, rowId, 200);
      return;
    }
    if (!form.checkValidity()) return;
    const f = new FormData(form),
      current = dataRef.current;
    const row = rowId
      ? current?.stages.find((r: any) => r.id === rowId)
      : undefined;
    if (rowId && !row) return;
    const job_title = String(f.get("job_title") || "").trim(),
      name = String(f.get("name") || "").trim(),
      sort_order = Number(f.get("sort_order"));
    if (!job_title || !name) return;
    if (
      row &&
      row.job_title === job_title &&
      row.name === name &&
      row.sort_order === sort_order
    )
      return;
    await mutate({
      action: "save",
      ...(row ? { id: row.id, version: row.version } : {}),
      job_title,
      name,
      sort_order,
    });
  }
  useEffect(
    () => () => {
      for (const timer of timers.current.values()) clearTimeout(timer);
    },
    [],
  );
  async function load() {
    const r = await apiFetch("/api/task-stages");
    const b = await r.json();
    if (!r.ok) throw Error(b.error);
    setData(b);
  }
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, []);
  async function mutate(body: any) {
    const before = dataRef.current;
    savingRef.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    const temp = {
      ...body,
      id: body.id || "saving",
      version: (body.version || 0) + 1,
    };
    setData({
      ...before,
      stages:
        body.action === "delete"
          ? before.stages.filter((r: any) => r.id !== body.id)
          : body.id
            ? before.stages.map((r: any) => (r.id === body.id ? temp : r))
            : [...before.stages, temp],
    });
    try {
      const r = await apiFetch("/api/task-stages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const b = await r.json();
      if (!r.ok) throw Error(b.error);
      setData((current: any) => ({
        ...current,
        stages:
          body.action === "delete"
            ? current.stages
            : current.stages.map((row: any) =>
                row.id === temp.id ? b.stage : row,
              ),
      }));
      if (!body.id) setAdding(null);
      setMessage(body.action === "delete" ? "Etapa removida." : "Etapa salva.");
    } catch (e) {
      setData(before);
      setError((e as Error).message);
    } finally {
      savingRef.current = false;
      setBusy(false);
    }
  }
  async function reorder(id: string, target: string) {
    if (savingRef.current || !data.canEdit || id === target) return;
    const source = data.stages.find((r: any) => r.id === id),
      destination = data.stages.find((r: any) => r.id === target);
    if (
      !source ||
      !destination ||
      source.job_title.trim().toLowerCase() !==
        destination.job_title.trim().toLowerCase()
    )
      return;
    const ordered = data.stages
      .filter(
        (r: any) =>
          r.job_title.trim().toLowerCase() ===
          source.job_title.trim().toLowerCase(),
      )
      .sort((a: any, b: any) => a.sort_order - b.sort_order);
    const from = ordered.findIndex((r: any) => r.id === id),
      to = ordered.findIndex((r: any) => r.id === target);
    ordered.splice(to, 0, ordered.splice(from, 1)[0]);
    const before = data;
    savingRef.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    setDragging(null);
    setData({
      ...data,
      stages: data.stages.map((r: any) => {
        const index = ordered.findIndex((o: any) => o.id === r.id);
        return index < 0 ? r : { ...r, sort_order: index + 1 };
      }),
    });
    try {
      const response = await apiFetch("/api/task-stages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reorder",
          stages: ordered.map((r: any) => ({ id: r.id, version: r.version })),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error);
      setData((current: any) => ({
        ...current,
        stages: current.stages.map(
          (r: any) => result.stages.find((o: any) => o.id === r.id) || r,
        ),
      }));
      setMessage("Ordem das etapas atualizada.");
    } catch (e) {
      setData(before);
      setError((e as Error).message);
    } finally {
      savingRef.current = false;
      setBusy(false);
    }
  }
  if (!data)
    return (
      <section>
        <h3>Etapas da tarefa</h3>
        {error ? <p role="alert">{error}</p> : <p>Carregando etapas…</p>}
      </section>
    );
  const rows = [...data.stages].sort(
    (a: any, b: any) =>
      a.job_title.localeCompare(b.job_title, "pt-BR") ||
      a.sort_order - b.sort_order ||
      a.name.localeCompare(b.name, "pt-BR"),
  );
  const groups = new Map<string, { name: string; rows: any[] }>();
  for (const row of rows) {
    const key = row.job_title.trim().toLocaleLowerCase("pt-BR");
    if (!groups.has(key)) groups.set(key, { name: row.job_title, rows: [] });
    groups.get(key)!.rows.push(row);
  }
  if (!groups.size || adding === "")
    groups.set("", { name: "Novo cargo", rows: [] });
  return (
    <section className="task-stages">
      <h3>Etapas da tarefa</h3>
      <p>
        Cadastre as etapas por cargo e defina a sequência de exibição. Esta
        lista será usada na futura visão do Kanban por etapa. Arraste pelo ícone
        ao lado da ordem para reorganizar, ou use as setas. Os campos são salvos
        automaticamente após a edição.
      </p>
      {error && <p role="alert">{error}</p>}
      <p role="status">{busy ? "Salvando…" : message}</p>
      <div className="task-toolbar">
        {data.canEdit && rows.length > 0 && (
          <button
            type="button"
            disabled={busy || adding !== null}
            onClick={() => {
              setNewRole("");
              setAdding("");
            }}
          >
            <Plus size={16} />
            Adicionar cargo
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            clearApiCache();
            void load().catch((e) => setError(e.message));
          }}
        >
          Atualizar lista
        </button>
      </div>
      {!data.canEdit && <p>Somente administradores podem editar as etapas.</p>}
      <datalist id="task-stage-roles">
        {[
          ...new Set<string>([
            ...data.roles,
            ...rows.map((r: any) => r.job_title),
          ]),
        ]
          .sort()
          .map((role) => (
            <option key={role} value={role} />
          ))}
      </datalist>
      {[...groups.entries()].map(([groupKey, group]) => (
        <section
          className="task-stage-group"
          key={groupKey}
          aria-label={group.name}
        >
          <header>
            <h4>{group.name}</h4>
            <small>
              {group.rows.length} {group.rows.length === 1 ? "etapa" : "etapas"}
            </small>
          </header>
          <div className="task-table-wrap">
            <table className="task-settings-table task-stages-table">
              <thead>
                <tr>
                  <th>Cargo</th>
                  <th>Etapa</th>
                  <th>Ordem da etapa</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {group.rows.map((row: any, index: number) => (
                  <tr
                    key={row.id + ":" + row.version}
                    data-stage-id={row.id}
                    onDragOver={(e) => {
                      if (dragging && !busy) e.preventDefault();
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragging) void reorder(dragging, row.id);
                    }}
                    className={
                      dragging === row.id ? "stage-dragging" : undefined
                    }
                  >
                    <td>
                      <input
                        form={"stage-" + row.id}
                        aria-label={"Cargo da etapa " + row.name}
                        name="job_title"
                        list="task-stage-roles"
                        onChange={() => scheduleAuto("stage-" + row.id, row.id)}
                        onBlur={() =>
                          scheduleAuto("stage-" + row.id, row.id, 0)
                        }
                        defaultValue={row.job_title}
                        maxLength={120}
                        required
                        disabled={!data.canEdit || busy}
                      />
                    </td>
                    <td>
                      <input
                        form={"stage-" + row.id}
                        aria-label={"Nome da etapa " + row.name}
                        name="name"
                        onChange={() => scheduleAuto("stage-" + row.id, row.id)}
                        onBlur={() =>
                          scheduleAuto("stage-" + row.id, row.id, 0)
                        }
                        defaultValue={row.name}
                        maxLength={160}
                        required
                        disabled={!data.canEdit || busy}
                      />
                    </td>
                    <td>
                      <div className="stage-order-controls">
                        <button
                          type="button"
                          className="stage-drag-handle"
                          draggable={!busy && data.canEdit}
                          disabled={busy || !data.canEdit}
                          aria-label={"Arrastar etapa " + row.name}
                          title="Arraste para reorganizar"
                          onDragStart={(e) => {
                            setDragging(row.id);
                            e.dataTransfer.setData("text/plain", row.id);
                            e.dataTransfer.effectAllowed = "move";
                          }}
                          onDragEnd={() => setDragging(null)}
                        >
                          <GripVertical size={16} />
                        </button>
                        <input
                          form={"stage-" + row.id}
                          aria-label={"Ordem da etapa " + row.name}
                          name="sort_order"
                          type="number"
                          min="1"
                          max="9999"
                          value={row.sort_order}
                          readOnly
                          required
                          disabled={!data.canEdit || busy}
                        />
                        <button
                          type="button"
                          aria-label={"Subir etapa " + row.name}
                          disabled={busy || !data.canEdit || index === 0}
                          onClick={() =>
                            void reorder(row.id, group.rows[index - 1].id)
                          }
                        >
                          <ArrowUp size={13} />
                        </button>
                        <button
                          type="button"
                          aria-label={"Descer etapa " + row.name}
                          disabled={
                            busy ||
                            !data.canEdit ||
                            index === group.rows.length - 1
                          }
                          onClick={() =>
                            void reorder(row.id, group.rows[index + 1].id)
                          }
                        >
                          <ArrowDown size={13} />
                        </button>
                      </div>
                    </td>
                    <td>
                      <form
                        id={"stage-" + row.id}
                        onSubmit={(e) => {
                          e.preventDefault();
                          cancelAuto("stage-" + row.id);
                          void autoSave("stage-" + row.id, row.id);
                        }}
                      >
                        <div className="task-toolbar">
                          <button
                            type="button"
                            aria-label={"Remover etapa " + row.name}
                            disabled={!data.canEdit || busy}
                            onClick={() => {
                              cancelAuto("stage-" + row.id);
                              void mutate({
                                action: "delete",
                                id: row.id,
                                version: row.version,
                              });
                            }}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </form>
                    </td>
                  </tr>
                ))}
                {!group.rows.length && adding !== groupKey && (
                  <tr>
                    <td colSpan={4}>Nenhuma etapa cadastrada.</td>
                  </tr>
                )}
                {adding === groupKey && (
                  <tr>
                    <td>
                      <input
                        form="new-stage"
                        value={newRole}
                        onChange={(e) => {
                          setNewRole(e.target.value);
                          scheduleAuto("new-stage");
                        }}
                        onBlur={() => scheduleAuto("new-stage", undefined, 0)}
                        aria-label="Cargo da nova etapa"
                        name="job_title"
                        list="task-stage-roles"
                        maxLength={120}
                        required
                        disabled={busy}
                      />
                    </td>
                    <td>
                      <input
                        form="new-stage"
                        onChange={() => scheduleAuto("new-stage")}
                        onBlur={() => scheduleAuto("new-stage", undefined, 0)}
                        aria-label="Nome da nova etapa"
                        name="name"
                        maxLength={160}
                        required
                        disabled={busy}
                      />
                    </td>
                    <td>
                      <input
                        form="new-stage"
                        readOnly
                        aria-label="Ordem da nova etapa"
                        name="sort_order"
                        type="number"
                        min="1"
                        max="9999"
                        value={Math.min(
                          9999,
                          Math.max(
                            0,
                            ...data.stages
                              .filter(
                                (r: any) =>
                                  r.job_title.trim().toLowerCase() ===
                                  newRole.trim().toLowerCase(),
                              )
                              .map((r: any) => r.sort_order),
                          ) + 1,
                        )}
                        required
                        disabled={busy}
                      />
                    </td>
                    <td>
                      <form
                        id="new-stage"
                        onSubmit={(e) => {
                          e.preventDefault();
                          cancelAuto("new-stage");
                          void autoSave("new-stage");
                        }}
                      >
                        <div className="task-toolbar">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              cancelAuto("new-stage");
                              setAdding(null);
                            }}
                          >
                            Cancelar
                          </button>
                        </div>
                      </form>
                    </td>
                  </tr>
                )}
                {data.canEdit && adding !== groupKey && (
                  <tr className="task-stage-add-row">
                    <td colSpan={4}>
                      <button
                        type="button"
                        disabled={busy || adding !== null}
                        onClick={() => {
                          setNewRole(groupKey ? group.name : "");
                          setAdding(groupKey);
                        }}
                      >
                        <Plus size={14} />
                        Adicionar etapa
                      </button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </section>
  );
}
