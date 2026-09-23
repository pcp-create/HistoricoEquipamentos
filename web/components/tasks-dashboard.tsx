"use client";
import "./tasks.css";
import { taskColumn, taskColumns, type TaskColumn } from "@/lib/tasks/kanban";
import {
  allowedTaskAttachment,
  taskAttachmentAccept,
  taskAttachmentTypeMessage,
} from "@/lib/tasks/attachment-types";
import {
  useEffect,
  useState,
  useRef,
  createContext,
  useContext,
  type ReactNode,
} from "react";
import { useSearchParams } from "next/navigation";
import SiteHeader from "./site-header";
const statusNames: Record<string, string> = {
  not_started: "Não iniciado",
  in_progress: "Em andamento",
  completed: "Concluída",
};
const priorityNames: Record<string, string> = {
  normal: "Normal",
  high: "Alta",
  urgent: "Urgente",
};
const sourceNames: Record<string, string> = {
  soon: "Próximo do vencimento",
  overdue: "Vencido",
  due: "Venceu / vence hoje",
  current: "Em dia",
  scheduled: "Em dia",
  incomplete: "Dados incompletos",
};
const date = (v: string | null) =>
  v
    ? new Date(v.length === 10 ? v + "T12:00:00Z" : v).toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        ...(v.length === 10
          ? { year: "numeric", month: "2-digit", day: "2-digit" }
          : {}),
      })
    : "—";
const day = (v: string | null) => v?.slice(0, 10) || "";
function waiting(t: any) {
  const minutes = Math.max(
    0,
    Math.floor(
      (Date.parse(
        t.first_assigned_at || t.completed_at || new Date().toISOString(),
      ) -
        Date.parse(t.created_at)) /
        60000,
    ),
  );
  return minutes >= 1440
    ? `${Math.floor(minutes / 1440)} dias e ${Math.floor((minutes % 1440) / 60)} h`
    : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}
async function api(url: string, body?: unknown) {
  const r = await fetch(
    url,
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : undefined,
  );
  if (r.status === 401) {
    window.location.assign(
      "/login?next=" + encodeURIComponent(location.pathname + location.search),
    );
    throw Error("Sessão expirada.");
  }
  const b = await r.json();
  if (!r.ok) throw Error(b.error || "Falha ao consultar tarefas.");
  return b;
}
export function TaskDrawer({
  id,
  onClose,
  onChanged,
}: {
  id: string;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    [data, setData] = useState<any>(null),
    [users, setUsers] = useState<any[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [assigned, setAssigned] = useState(""),
    [priority, setPriority] = useState("normal"),
    [automatic, setAutomatic] = useState(true),
    [addingNote, setAddingNote] = useState(false),
    [title, setTitle] = useState(""),
    [description, setDescription] = useState("");
  function accept(b: any) {
    setData(b);
    setAssigned(b.task.assigned_to || "");
    setPriority(b.task.priority);
    setAutomatic(!b.task.priority_manual);
  }
  async function reload() {
    accept(await api("/api/tasks?id=" + id));
  }
  useEffect(() => {
    dialog.current?.showModal();
    let alive = true;
    setData(null);
    setError("");
    Promise.all([api("/api/tasks?id=" + id), api("/api/tasks")])
      .then(([d, list]) => {
        if (alive) {
          accept(d);
          setUsers(list.users);
        }
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [id]);
  async function save(action: string) {
    setBusy(true);
    setError("");
    try {
      accept(
        await api("/api/tasks", {
          action,
          id,
          version: data.task.version,
          assignedTo: assigned,
          priority,
          automaticPriority: automatic,
          title,
          description,
        }),
      );
      if (action === "note") {
        setTitle("");
        setDescription("");
        setAddingNote(false);
      }
      onChanged?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      if (file.size > 3000000) throw Error("Selecione um arquivo de até 3 MB.");
      if (!allowedTaskAttachment(file.name))
        throw Error(taskAttachmentTypeMessage);
      const form = new FormData();
      form.set("id", id);
      form.set("file", file);
      const r = await fetch("/api/tasks", { method: "POST", body: form });
      const b = await r.json();
      if (!r.ok) throw Error(b.error || "Falha ao anexar.");
      accept(b);
      onChanged?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const t = data?.task;
  return (
    <dialog
      ref={dialog}
      className="task-drawer"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      aria-labelledby="task-heading"
    >
      <header>
        <div>
          <small>TAREFA · TAR-{id}</small>
          <h2 id="task-heading">{t?.title || "Carregando tarefa…"}</h2>
        </div>
        <button type="button" onClick={onClose} aria-label="Fechar tarefa">
          ×
        </button>
      </header>
      {error && (
        <p role="alert" className="task-error">
          {error}{" "}
          <button onClick={() => reload().catch((e) => setError(e.message))}>
            Recarregar tarefa
          </button>
        </p>
      )}
      {t && (
        <div className="task-blocks">
          <div>
            <section className="task-card">
              <h3>Informações da tarefa</h3>
              <dl>
                <dt>Origem</dt>
                <dd>{t.origin}</dd>
                <dt>Equipamento / cliente</dt>
                <dd>
                  <a
                    href={
                      "/equipamentos?equipment=" +
                      t.equipment_id +
                      (t.plan_id ? "&plan=" + t.plan_id : "")
                    }
                  >
                    {t.equipment_name}
                  </a>
                  <small>{t.customer}</small>
                </dd>
                <dt>Situação do processo</dt>
                <dd>{sourceNames[t.source_status] || t.source_status}</dd>
                <dt>Vencimento do processo</dt>
                <dd>{date(day(t.due_date))}</dd>
              </dl>
              <fieldset disabled={busy || t.status === "completed"}>
                <label>
                  Atribuído a
                  <select
                    value={assigned}
                    onChange={(e) => setAssigned(e.target.value)}
                  >
                    <option value="">Não atribuído</option>
                    {assigned && !users.some((u) => u.email === assigned) && (
                      <option value={assigned}>
                        {t.assignee_name || "Funcionário sem nome cadastrado"}{" "}
                        (inativo)
                      </option>
                    )}
                    {users.map((u) => (
                      <option key={u.email} value={u.email}>
                        {u.display_name || "Funcionário sem nome cadastrado"}
                        {u.phone ? "" : " · Sem WhatsApp cadastrado"}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Prioridade
                  <select
                    value={priority}
                    onChange={(e) => {
                      setPriority(e.target.value);
                      setAutomatic(false);
                    }}
                  >
                    {Object.entries(priorityNames).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="task-check">
                  <input
                    type="checkbox"
                    checked={automatic}
                    onChange={(e) => setAutomatic(e.target.checked)}
                  />{" "}
                  Atualizar prioridade automaticamente pelo alerta
                </label>
                <button onClick={() => save("update")}>
                  Salvar responsável e prioridade
                </button>
              </fieldset>
              {t.status === "completed" && (
                <p>Esta ocorrência foi concluída e não será reaberta.</p>
              )}
            </section>
            <section className="task-card">
              <h3>Acompanhamento</h3>
              <dl>
                <dt>Status</dt>
                <dd>{taskColumns[taskColumn(t)]}</dd>
                <dt>Espera pela primeira atribuição</dt>
                <dd>
                  {waiting(t)}
                  {!t.first_assigned_at && t.status !== "completed"
                    ? " · Aguardando ação inicial"
                    : ""}
                </dd>
                <dt>Criado por / em</dt>
                <dd>Sistema · {date(t.created_at)}</dd>
                <dt>Última alteração</dt>
                <dd>
                  {t.modifier_name ||
                    (t.updated_by === "Sistema"
                      ? "Sistema"
                      : "Usuário sem nome cadastrado")}{" "}
                  · {date(t.updated_at)}
                </dd>
                {t.completed_at && (
                  <>
                    <dt>Concluída em</dt>
                    <dd>{date(t.completed_at)}</dd>
                  </>
                )}
              </dl>
              <p>
                A conclusão automática acompanha a regularização do processo.
                Também é possível concluir manualmente pelo Kanban.
              </p>
            </section>
            {data.notifications.length > 0 && (
              <section className="task-card">
                <h3>Avisos de atribuição</h3>
                {data.notifications.map((n: any) => (
                  <p key={n.id}>
                    {n.recipient_name || "Funcionário sem nome cadastrado"}
                    <small>
                      {
                        {
                          pending: "Aguardando envio pelo n8n",
                          sent: "Enviado",
                          skipped:
                            "Não enviado: atribuição não está mais vigente ou destinatário indisponível",
                        }[n.state as string]
                      }{" "}
                      · {date(n.created_at)}
                    </small>
                  </p>
                ))}
              </section>
            )}
          </div>
          <aside>
            <section className="task-card">
              <h3>Anexos ({data.attachments.length})</h3>
              <label>
                Incluir PDF ou Office (até 3 MB)
                <input
                  disabled={busy}
                  type="file"
                  accept={taskAttachmentAccept}
                  onChange={(e) => {
                    void upload(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
              <small>{taskAttachmentTypeMessage}</small>
              {data.attachments.map((a: any) => (
                <p key={a.id}>
                  <a href={"/api/tasks/attachments/" + a.id}>{a.filename}</a>
                  <small>
                    {a.created_name} · {date(a.created_at)} ·{" "}
                    {Math.ceil(a.size / 1024)} KB
                  </small>
                </p>
              ))}
            </section>
            <section className="task-card">
              <h3>Notas ({data.notes.length})</h3>
              <button
                disabled={busy}
                onClick={() => setAddingNote(!addingNote)}
              >
                {addingNote ? "Cancelar nota" : "Incluir nota"}
              </button>
              {addingNote && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void save("note");
                  }}
                >
                  <label>
                    Título da nota
                    <input
                      required
                      maxLength={160}
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                    />
                  </label>
                  <label>
                    Descritivo da nota
                    <textarea
                      required
                      maxLength={12000}
                      rows={5}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                    />
                  </label>
                  <button disabled={busy}>Salvar nota</button>
                </form>
              )}
              {data.notes.map((n: any) => (
                <article key={n.id} className="task-note">
                  <strong>{n.title}</strong>
                  <small>
                    {n.automatic ? "Automática · " : ""}
                    {n.created_name} · {date(n.created_at)}
                  </small>
                  <p>{n.description}</p>
                </article>
              ))}
            </section>
          </aside>
        </div>
      )}
    </dialog>
  );
}
function TaskChart({ tasks }: { tasks: any[] }) {
  const groups = new Map<
    string,
    { name: string; counts: Record<TaskColumn, number> }
  >();
  for (const task of tasks) {
    const key = task.assigned_to?.trim().toLowerCase() || "unassigned";
    if (!groups.has(key))
      groups.set(key, {
        name: task.assigned_to
          ? task.assignee_name || "Funcionário sem nome cadastrado"
          : "Não atribuído",
        counts: { pending: 0, in_progress: 0, overdue: 0, completed: 0 },
      });
    groups.get(key)!.counts[taskColumn(task)]++;
  }
  const entries = [...groups.entries()].sort((a, b) =>
    a[1].name.localeCompare(b[1].name, "pt-BR"),
  );
  const maximum = Math.max(
    1,
    ...entries.flatMap(([, group]) => Object.values(group.counts)),
  );
  return (
    <section
      className="task-card task-chart"
      aria-label="Gráfico de tarefas por responsável"
    >
      <h2>Tarefas por responsável</h2>
      <p>Quantidade por status, considerando os filtros selecionados.</p>
      {!entries.length && <p>Nenhuma tarefa encontrada.</p>}
      {entries.map(([key, group]) => (
        <section
          key={key}
          className="task-chart-person"
          aria-label={group.name}
        >
          <h3>
            {group.name}{" "}
            <small>
              ·{" "}
              {Object.values(group.counts).reduce(
                (sum, count) => sum + count,
                0,
              )}{" "}
              tarefas
            </small>
          </h3>
          {(Object.entries(taskColumns) as [TaskColumn, string][]).map(
            ([status, label]) => (
              <div
                key={status}
                className="task-chart-row"
                aria-label={`${label}: ${group.counts[status]}`}
              >
                <span>{label}</span>
                <div className="task-chart-track" aria-hidden="true">
                  <div
                    className={`task-chart-bar task-chart-${status}`}
                    style={{
                      width: `${(group.counts[status] / maximum) * 100}%`,
                    }}
                  />
                </div>
                <strong>{group.counts[status]}</strong>
              </div>
            ),
          )}
        </section>
      ))}
    </section>
  );
}

export default function TasksDashboard() {
  const params = useSearchParams(),
    [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [mine, setMine] = useState(false),
    [view, setView] = useState("list"),
    [status, setStatus] = useState("all"),
    [query, setQuery] = useState(""),
    [selected, setSelected] = useState<string | null>(params.get("task")),
    [month, setMonth] = useState(() =>
      new Date()
        .toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })
        .slice(0, 7),
    );
  const [dragging, setDragging] = useState<string | null>(null);
  async function load() {
    const b = await api("/api/tasks");
    setData(b);
  }
  async function sync() {
    setBusy(true);
    setError("");
    try {
      await api("/api/tasks", { action: "sync" });
      await load();
    } catch (e) {
      setError((e as Error).message);
      try {
        await load();
      } catch {}
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void sync();
    const timer = setInterval(() => void sync(), 60000);
    return () => clearInterval(timer);
  }, []);
  const rows = (data?.tasks || []).filter(
    (t: any) =>
      (!mine ||
        t.is_mine === true ||
        (t.is_mine === undefined &&
          t.assigned_to?.trim().toLowerCase() ===
            data.email?.trim().toLowerCase())) &&
      (status === "all" || status === "active"
        ? status === "all" || t.status !== "completed"
        : taskColumn(t) === status) &&
      (!query ||
        `${t.id} ${t.title} ${t.equipment_name} ${t.customer} ${t.origin} ${t.assignee_name || ""}`
          .toLocaleLowerCase("pt-BR")
          .includes(query.toLocaleLowerCase("pt-BR"))),
  );
  async function moveTask(id: string, column: TaskColumn) {
    const task = data?.tasks.find((t: any) => String(t.id) === id);
    if (!task || busy || taskColumn(task) === column) return;
    let assignment: "keep" | "self" = "self";
    if (
      column === "in_progress" &&
      task.assigned_to &&
      task.assigned_to.toLowerCase() !== data.email?.toLowerCase()
    ) {
      assignment = window.confirm(
        `Esta tarefa está atribuída a ${task.assignee_name || "um funcionário"}. Deseja assumir a tarefa?\n\nOK: atribuir a mim.\nCancelar: manter o responsável atual.`,
      )
        ? "self"
        : "keep";
    }

    setBusy(true);
    setError("");
    try {
      await api("/api/tasks", {
        action: "move",
        id,
        version: task.version,
        column,
        assignment,
      });
      await load();
    } catch (e) {
      setError((e as Error).message);
      await load().catch(() => {});
    } finally {
      setBusy(false);
      setDragging(null);
    }
  }
  function open(id: string) {
    setSelected(String(id));
    history.replaceState(null, "", "/tarefas?task=" + id);
  }
  function close() {
    setSelected(null);
    history.replaceState(null, "", "/tarefas");
  }
  const [year, mo] = month.split("-").map(Number),
    offset = new Date(Date.UTC(year, mo - 1, 1)).getUTCDay(),
    days = new Date(Date.UTC(year, mo, 0)).getUTCDate();
  return (
    <>
      <SiteHeader active="tasks" />
      <main className="tasks-page">
        <header className="task-heading">
          <div>
            <h1>Tarefas</h1>
            <p>Alertas, responsáveis e histórico das tratativas.</p>
            <small>Última verificação: {date(data?.syncedAt)}</small>
          </div>
          <button disabled={busy} onClick={sync}>
            {busy ? "Verificando alertas…" : "Atualizar alertas"}
          </button>
        </header>
        {error && (
          <p role="alert" className="task-error">
            {error}
          </p>
        )}
        <div className="task-control-groups">
          <nav className="task-toolbar" aria-label="Filtros de responsáveis">
            <strong>Responsáveis</strong>
            <button aria-pressed={!mine} onClick={() => setMine(false)}>
              Últimas tarefas · Todos
            </button>
            <button aria-pressed={mine} onClick={() => setMine(true)}>
              Minhas tarefas
            </button>
          </nav>
          <nav
            className="task-toolbar task-view-controls"
            aria-label="Modo de visualização"
          >
            <strong>Visualização</strong>
            <button
              aria-pressed={view === "list"}
              onClick={() => setView("list")}
            >
              Lista
            </button>
            <button
              aria-pressed={view === "calendar"}
              onClick={() => setView("calendar")}
            >
              Calendário
            </button>
            <button
              aria-pressed={view === "kanban"}
              onClick={() => setView("kanban")}
            >
              Kanban
            </button>
            <button
              aria-pressed={view === "chart"}
              onClick={() => setView("chart")}
            >
              Gráfico
            </button>
          </nav>
        </div>
        <div className="task-toolbar">
          <label>
            Pesquisar
            <input
              placeholder="Tarefa, cliente ou equipamento"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <label>
            Status
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="active">Em aberto</option>
              <option value="all">Todos</option>
              {Object.entries(taskColumns).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <span>{rows.length} tarefas</span>
        </div>
        {view === "chart" ? (
          <TaskChart tasks={rows} />
        ) : view === "kanban" ? (
          <section className="task-kanban" aria-label="Quadro de tarefas">
            {(Object.entries(taskColumns) as [TaskColumn, string][]).map(
              ([key, label]) => {
                const cards = rows.filter((t: any) => taskColumn(t) === key);
                return (
                  <section
                    key={key}
                    className={
                      "task-kanban-column " + (dragging ? "drop-ready" : "")
                    }
                    aria-label={label}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const id = e.dataTransfer.getData("text/plain");
                      void moveTask(id, key);
                    }}
                  >
                    <h2>
                      {label} <span>{cards.length}</span>
                    </h2>
                    {cards.map((t: any) => (
                      <article
                        key={t.id}
                        className="task-kanban-card"
                        draggable={!busy && t.status !== "completed"}
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", String(t.id));
                          e.dataTransfer.effectAllowed = "move";
                          setDragging(String(t.id));
                        }}
                        onDragEnd={() => setDragging(null)}
                      >
                        <button
                          className="task-link"
                          onClick={() => open(t.id)}
                        >
                          TAR-{t.id} · {t.title}
                        </button>
                        <p>{t.equipment_name}</p>
                        <small>{t.origin}</small>
                        <small>
                          {t.assignee_name ||
                            (t.assigned_to
                              ? "Funcionário sem nome cadastrado"
                              : "Não atribuído")}
                        </small>
                        <small>Vencimento: {date(day(t.due_date))}</small>
                        <span className={"task-priority " + t.priority}>
                          {priorityNames[t.priority]}
                        </span>
                        {t.status !== "completed" && (
                          <label>
                            Mover tarefa
                            <select
                              aria-label={"Mover TAR-" + t.id}
                              disabled={busy}
                              value={key}
                              onChange={(e) =>
                                void moveTask(
                                  String(t.id),
                                  e.target.value as TaskColumn,
                                )
                              }
                            >
                              {Object.entries(taskColumns).map(([k, v]) => (
                                <option key={k} value={k}>
                                  {v}
                                </option>
                              ))}
                            </select>
                          </label>
                        )}
                      </article>
                    ))}
                    {!cards.length && (
                      <p className="task-kanban-empty">Nenhuma tarefa</p>
                    )}
                  </section>
                );
              },
            )}
          </section>
        ) : view === "list" ? (
          <div className="task-table">
            <table>
              <thead>
                <tr>
                  <th>Tarefa / equipamento</th>
                  <th>Origem</th>
                  <th>Atribuído a</th>
                  <th>Prioridade</th>
                  <th>Status / espera inicial</th>
                  <th>Vencimento</th>
                  <th>Último modificador</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t: any) => (
                  <tr key={t.id}>
                    <td>
                      <button className="task-link" onClick={() => open(t.id)}>
                        TAR-{t.id} · {t.title}
                      </button>
                      <small>{t.equipment_name}</small>
                      <small>{t.customer}</small>
                    </td>
                    <td>{t.origin}</td>
                    <td>
                      <button className="task-link" onClick={() => open(t.id)}>
                        {t.assignee_name ||
                          (t.assigned_to
                            ? "Funcionário sem nome cadastrado"
                            : "Não atribuído")}
                      </button>
                    </td>
                    <td>
                      <span className={"task-priority " + t.priority}>
                        {priorityNames[t.priority]}
                      </span>
                    </td>
                    <td>
                      {taskColumns[taskColumn(t)]}
                      <small>{waiting(t)}</small>
                    </td>
                    <td>{date(day(t.due_date))}</td>
                    <td>
                      {t.modifier_name ||
                        (t.updated_by === "Sistema"
                          ? "Sistema"
                          : "Usuário sem nome cadastrado")}
                      <small>{date(t.updated_at)}</small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!rows.length && <p>Nenhuma tarefa encontrada.</p>}
          </div>
        ) : (
          <section className="task-card">
            <label>
              Mês
              <input
                type="month"
                value={month}
                onChange={(e) => {
                  if (e.target.value) setMonth(e.target.value);
                }}
              />
            </label>
            <p>Organizado pela data de vencimento do processo.</p>
            <div className="task-calendar">
              {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
                <strong key={d}>{d}</strong>
              ))}
              {Array.from({ length: offset }, (_, i) => (
                <div key={"blank" + i} />
              ))}
              {Array.from({ length: days }, (_, i) => {
                const key = month + "-" + String(i + 1).padStart(2, "0");
                return (
                  <div key={key}>
                    <b>{i + 1}</b>
                    {rows
                      .filter((t: any) => day(t.due_date) === key)
                      .map((t: any) => (
                        <button key={t.id} onClick={() => open(t.id)}>
                          TAR-{t.id} · {t.equipment_name}
                          <small>{taskColumns[taskColumn(t)]}</small>
                        </button>
                      ))}
                  </div>
                );
              })}
            </div>
            <h3>Sem data definida</h3>
            {rows
              .filter((t: any) => !t.due_date)
              .map((t: any) => (
                <p key={t.id}>
                  <button onClick={() => open(t.id)}>
                    TAR-{t.id} · {t.title}
                  </button>
                </p>
              ))}
          </section>
        )}
      </main>
      {selected && (
        <TaskDrawer
          key={selected}
          id={selected}
          onClose={close}
          onChanged={() => void load()}
        />
      )}
    </>
  );
}
const TaskContext = createContext<{ tasks: any[]; open: (id: string) => void }>(
  { tasks: [], open: () => {} },
);
export function EquipmentTaskProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<any[]>([]),
    [selected, setSelected] = useState<string | null>(null),
    [error, setError] = useState("");
  async function load() {
    const b = await api("/api/tasks");
    setTasks(b.tasks);
  }
  useEffect(() => {
    let alive = true;
    async function refresh() {
      try {
        await api("/api/tasks", { action: "sync" });
        const b = await api("/api/tasks");
        if (alive) {
          setTasks(b.tasks);
          setError("");
        }
      } catch {
        if (alive)
          setError(
            "Tarefas indisponíveis. Acesse o módulo Tarefas para atualizar os alertas.",
          );
      }
    }
    void refresh();
    const timer = setInterval(refresh, 60000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);
  return (
    <TaskContext.Provider
      value={{ tasks, open: (id) => setSelected(String(id)) }}
    >
      {children}
      {error && (
        <p role="status" className="task-error">
          {error}
        </p>
      )}
      {selected && (
        <TaskDrawer
          key={selected}
          id={selected}
          onClose={() => setSelected(null)}
          onChanged={() => void load()}
        />
      )}
    </TaskContext.Provider>
  );
}
export function EquipmentTaskLinks({
  equipment,
  plan,
}: {
  equipment: string;
  plan?: string;
}) {
  const { tasks, open } = useContext(TaskContext);
  const rows = tasks.filter(
    (t) =>
      String(t.equipment_id) === String(equipment) &&
      (plan ? t.plan_id === plan : !t.plan_id),
  );
  return (
    <div className="equipment-task-links">
      {rows.map((t) => (
        <a
          href={"/tarefas?task=" + t.id}
          key={t.id}
          onClick={(e) => {
            e.preventDefault();
            open(t.id);
          }}
        >
          TAR-{t.id} · {taskColumns[taskColumn(t)]}
        </a>
      ))}
    </div>
  );
}
