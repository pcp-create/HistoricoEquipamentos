"use client";
import { useEffect, useRef, useState } from "react";
import { Circle, CircleCheck, Plus, ListChecks, Pencil, Trash2, Check, X } from "lucide-react";
type Item = { id: string; title: string; completed: boolean; version: number };
type Checklist = { id: string; title: string; items: Item[] };
export default function TaskChecklists({ taskId }: { taskId: string }) {
  const [lists, setLists] = useState<Checklist[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [creating, setCreating] = useState(false),
    [title, setTitle] = useState(""),
    [editing, setEditing] = useState<string | null>(null),
    [drafts, setDrafts] = useState<Record<string, string>>({});
  const [itemEditor, setItemEditor] = useState<{id: string; title: string; version: number} | null>(null);
  const [listEditor, setListEditor] = useState<{id: string; title: string; previousTitle: string} | null>(null);
  const saving = useRef(false);
  const addButtons = useRef<Record<string, HTMLButtonElement | null>>({});
  function closeEditor(listId: string) {
    setEditing(null);
    setDrafts((current) => ({ ...current, [listId]: "" }));
    requestAnimationFrame(() => addButtons.current[listId]?.focus());
  }
  async function load(signal?: AbortSignal) {
    const r = await fetch("/api/tasks/checklists?taskId=" + taskId, {
      cache: "no-store",
      signal,
    });
    const b = await r.json();
    if (!r.ok) throw Error(b.error);
    setLists(b.lists);
    setError("");
  }
  useEffect(() => {
    const c = new AbortController();
    setLists([]);
    setLoading(true);
    load(c.signal)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [taskId]);
  async function save(body: any) {
    if (saving.current) return false;
    saving.current = true;
    const previous = lists;
    let reconciled = false;
    if (body.action === "toggle")
      setLists(current => current.map(list => ({...list, items: list.items.map(item =>
        item.id === body.id ? {...item, completed: body.completed} : item)})));
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/tasks/checklists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, taskId }),
      });
      const b = await r.json();
      if (!r.ok) {
        if (r.status === 409) { await load(); reconciled = true; }
        throw Error(b.error);
      }
      setLists(b.lists);
      return true;
    } catch (e) {
      if (body.action === "toggle" && !reconciled) setLists(previous);
      setError((e as Error).message);
      return false;
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  return (
    <section
      className="task-card task-checklists"
      aria-label="Lista de verificação"
    >
      <div className="task-checklist-heading">
        <h3>
          <ListChecks size={18} />
          Lista de verificação
        </h3>
        <button
          type="button"
          disabled={busy || loading}
          onClick={() => setCreating(!creating)}
        >
          <Plus size={16} />
          Criar lista
        </button>
      </div>
      {loading && <p role="status">Carregando listas…</p>}
      {error && (
        <p role="alert" className="task-error">
          {error}{" "}
          <button
            type="button"
            onClick={() => void load().catch((e) => setError(e.message))}
          >
            Atualizar listas
          </button>
        </p>
      )}
      {creating && (
        <form
          className="task-checklist-add"
          onSubmit={async (e) => {
            e.preventDefault();
            if (
              await save({
                action: "create_list",
                id: crypto.randomUUID(),
                title,
              })
            ) {
              setTitle("");
              setCreating(false);
            }
          }}
        >
          <label>
            Nome da lista
            <input
              autoFocus
              required
              maxLength={160}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={busy}
            />
          </label>
          <button disabled={busy || !title.trim()}>Salvar lista</button>
        </form>
      )}
      {!loading && !error && !lists.length && (
        <p className="task-checklist-empty">
          Organize as etapas desta tarefa em uma lista.
        </p>
      )}
      {lists.map((list) => {
        const sorted = [...list.items].sort(
          (a, b) => Number(a.completed) - Number(b.completed),
        );
        const done = list.items.filter((i) => i.completed).length;
        return (
          <div className="task-checklist" key={list.id}>
            <div className="task-checklist-heading">
              {listEditor?.id === list.id ? (
                <form className="task-checklist-edit" onSubmit={async e => {
                  e.preventDefault();
                  if (await save({action: "rename_list", ...listEditor})) setListEditor(null);
                }} onKeyDown={e => {
                  if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); if (!busy) setListEditor(null); }
                }}>
                  <input autoFocus aria-label="Título da lista" required maxLength={160}
                    disabled={busy} value={listEditor.title}
                    onChange={e => setListEditor({...listEditor, title: e.target.value})} />
                  <button type="submit" aria-label="Salvar título da lista" title="Salvar título" disabled={busy || !listEditor.title.trim()}><Check size={16}/></button>
                  <button type="button" className="task-checklist-delete" aria-label="Excluir lista" title="Excluir lista e seus itens" disabled={busy} onClick={async () => {
                    if (window.confirm('Excluir a lista "' + list.title + '" e todos os seus itens? Esta ação não pode ser desfeita.') &&
                      await save({action: "delete_list", id: list.id, previousTitle: listEditor.previousTitle}))
                      setListEditor(null);
                  }}><Trash2 size={16}/></button>
                  <button type="button" aria-label="Cancelar edição do título" title="Cancelar" disabled={busy} onClick={() => setListEditor(null)}><X size={16}/></button>
                </form>
              ) : (
                <div className="task-checklist-title">
                  <h4>{list.title}</h4>
                  <button type="button" className="task-checklist-title-pencil"
                    aria-label={"Editar título: " + list.title} title="Editar título"
                    disabled={busy} onClick={() => setListEditor({id:list.id,title:list.title,previousTitle:list.title})}>
                    <Pencil size={15}/>
                  </button>
                </div>
              )}
              <small aria-label="Progresso da lista">
                {done}/{list.items.length} concluídos
              </small>
            </div>
            <ul>
              {sorted.map((item) => (
                <li
                  key={item.id}
                  className={item.completed ? "is-completed" : ""}
                >
                  <button
                    type="button"
                    className={
                      "task-completion-icon " +
                      (item.completed ? "is-completed" : "")
                    }
                    aria-label={
                      (item.completed
                        ? "Marcar como pendente: "
                        : "Concluir item: ") + item.title
                    }
                    aria-pressed={item.completed}
                    disabled={busy}
                    onClick={() =>
                      void save({
                        action: "toggle",
                        id: item.id,
                        version: item.version,
                        completed: !item.completed,
                      })
                    }
                  >
                    {item.completed ? (
                      <CircleCheck size={22} />
                    ) : (
                      <Circle size={22} />
                    )}
                  </button>
                  {itemEditor?.id === item.id ? (
                    <form className="task-checklist-edit" onSubmit={async e => {
                      e.preventDefault();
                      if (await save({action: "edit_item", ...itemEditor})) setItemEditor(null);
                    }} onKeyDown={e => {
                      if (e.key === "Escape") { e.stopPropagation(); if (!busy) setItemEditor(null); }
                    }}>
                      <input autoFocus aria-label="Editar título do item" required maxLength={500}
                        disabled={busy} value={itemEditor.title}
                        onChange={e => setItemEditor({...itemEditor, title: e.target.value})} />
                      <button type="submit" aria-label="Salvar item" title="Salvar item" disabled={busy || !itemEditor.title.trim()}><Check size={16} /></button>
                      <button type="button" aria-label="Cancelar edição" title="Cancelar edição" disabled={busy} onClick={() => setItemEditor(null)}><X size={16} /></button>
                    </form>
                  ) : (
                    <>
                      <span>{item.title}</span>
                      <div className="task-checklist-item-actions">
                        <button type="button" aria-label={"Editar item: " + item.title} title="Editar item"
                          disabled={busy} onClick={() => setItemEditor({id: item.id, title: item.title, version: item.version})}><Pencil size={16} /></button>
                        <button type="button" className="task-checklist-delete" aria-label={"Remover item: " + item.title} title="Remover item"
                          disabled={busy} onClick={() => {
                            if (window.confirm('Remover o item "' + item.title + '"?'))
                              void save({action: "delete_item", id: item.id, version: item.version});
                          }}><Trash2 size={16} /></button>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
            {editing === list.id ? (
              <form
                className="task-checklist-item-editor"
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!busy) closeEditor(list.id);
                  }
                }}
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!drafts[list.id]?.trim()) return;
                  if (
                    await save({
                      action: "add_item",
                      id: crypto.randomUUID(),
                      listId: list.id,
                      title: drafts[list.id],
                    })
                  )
                    closeEditor(list.id);
                }}
              >
                <Circle size={22} aria-hidden="true" />
                <input
                  autoFocus
                  aria-label={"Novo item de " + list.title}
                  placeholder="Digite um item e pressione Enter"
                  enterKeyHint="done"
                  required
                  maxLength={500}
                  disabled={busy}
                  value={drafts[list.id] || ""}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && e.nativeEvent.isComposing)
                      e.preventDefault();
                  }}
                  onChange={(e) =>
                    setDrafts({ ...drafts, [list.id]: e.target.value })
                  }
                />
              </form>
            ) : (
              <button
                type="button"
                className="task-checklist-add-trigger"
                aria-label={"Adicionar item em " + list.title}
                ref={(button) => {
                  addButtons.current[list.id] = button;
                }}
                disabled={busy}
                onClick={() => setEditing(list.id)}
              >
                <Plus size={18} aria-hidden="true" />
                Adicionar Item
              </button>
            )}
          </div>
        );
      })}
    </section>
  );
}
