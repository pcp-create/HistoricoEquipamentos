"use client";
import { apiFetch, hasFreshApiResponse } from "@/lib/client-api-cache";
import "./tasks.css";
import OrderDetailLink from "./order-detail-link";
import TaskReminders from "./task-reminders";
import {
  Plus,
  Circle,
  CircleCheck,
  List,
  CalendarDays,
  Columns3,
  ChartNoAxesColumnIncreasing,
} from "lucide-react";
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
import TaskSettings from "./task-settings";
function requestAssignmentReason(): string | null {
  const value = window.prompt("Justifique a mudança de responsável:");
  if (value === null) return null;
  if (!value.trim() || value.trim().length > 2000) {
    window.alert("Informe uma justificativa com até 2.000 caracteres.");
    return null;
  }
  return value.trim();
}
function TaskStatus({ task }: { task: any }) {
  return (
    <span
      className={
        task.status === "completed" ? "task-status-completed" : undefined
      }
    >
      {task.status === "completed"
        ? "Concluída"
        : taskColumn(task) === "overdue" ? "Atrasada" : taskColumns[taskColumn(task)]}
    </span>
  );
}
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
  const r = await apiFetch(
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
let taskSnapshotRequest: Promise<any> | null = null;
function taskSnapshot(force = false) {
  if (taskSnapshotRequest) return taskSnapshotRequest;
  taskSnapshotRequest = (async () => {
    if (force || !hasFreshApiResponse("/api/tasks"))
      await api("/api/tasks", { action: "sync" });
    return api("/api/tasks");
  })().finally(() => {
    taskSnapshotRequest = null;
  });
  return taskSnapshotRequest;
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
    const before = data;
    const changed =
      action === "update" &&
      (assigned.trim().toLowerCase() || null) !== data.task.assigned_to;
    const assignmentReason = changed ? requestAssignmentReason() : undefined;
    if (assignmentReason === null) return;
    if (changed)
      setData({
        ...data,
        task: {
          ...data.task,
          assigned_to: assigned || null,
          assignee_name: users.find((u: any) => u.email === assigned)
            ?.display_name,
          status: assigned ? "in_progress" : "not_started",
        },
      });
    setBusy(true);
    setError("");
    try {
      accept(
        await api("/api/tasks", {
          action,
          id,
          version: data.task.version,
          ...(action === "move" ? { column: "completed" } : {}),
          assignmentReason,
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
      if (changed) accept(before);
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
      const r = await apiFetch("/api/tasks", { method: "POST", body: form });
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
                {t.order_id && (
                  <>
                    <dt>OS vinculada</dt>
                    <dd>
                      <OrderDetailLink
                        id={String(t.order_id)}
                        company={t.order_company}
                        number={t.order_number || String(t.order_id)}
                      >
                        OS {t.order_number || t.order_id} · Empresa{" "}
                        {t.order_company}
                      </OrderDetailLink>
                    </dd>
                  </>
                )}
                <dt>Equipamento / cliente</dt>
                <dd>
                  {t.equipment_id ? (
                    <a
                      href={
                        "/equipamentos?equipment=" +
                        t.equipment_id +
                        (t.plan_id ? "&plan=" + t.plan_id : "")
                      }
                    >
                      {t.equipment_name}
                    </a>
                  ) : (
                    "Sem equipamento vinculado"
                  )}
                  <small>{t.customer}</small>
                </dd>
                <dt>Situação do processo</dt>
                <dd>
                  {t.source_status === "manual"
                    ? "Cadastro manual"
                    : sourceNames[t.source_status] || t.source_status}
                </dd>
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
                <p>
                  {t.source_key?.startsWith("manual:")
                    ? "Tarefa manual concluída. Você pode reabri-la em Acompanhamento."
                    : "Esta ocorrência foi concluída e não será reaberta."}
                </p>
              )}
            </section>
            <TaskReminders
              task={t}
              onChanged={() => void reload().catch((e) => setError(e.message))}
            />
            <section className="task-card">
              <h3>Acompanhamento</h3>
              {t.status === "completed" &&
                t.source_key?.startsWith("manual:") && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void save("reopen")}
                  >
                    Reabrir tarefa
                  </button>
                )}
              {t.status !== "completed" &&
                t.source_key?.startsWith("manual:") && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void save("move")}
                  >
                    Concluir tarefa
                  </button>
                )}
              <dl>
                <dt>Status</dt>
                <dd>
                  <TaskStatus task={t} />
                </dd>
                <dt>Espera pela primeira atribuição</dt>
                <dd>
                  {waiting(t)}
                  {!t.first_assigned_at && t.status !== "completed"
                    ? " · Aguardando ação inicial"
                    : ""}
                </dd>
                <dt>Criado por / em</dt>
                <dd>
                  {t.creator_name || "Sistema"} · {date(t.created_at)}
                </dd>
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
                {t.source_key?.startsWith("manual:")
                  ? "Esta tarefa manual pode ser concluída aqui ou pelo Kanban."
                  : "Esta tarefa será concluída automaticamente quando a pendência do processo de origem for resolvida."}
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
                  <a
                    href={"/api/tasks/attachments/" + a.id}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {a.filename}
                  </a>
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
    [mine, setMine] = useState(params.get("mine") === "1"),
    [responsible, setResponsible] = useState("all"),
    [originFilter, setOriginFilter] = useState("all"),
    [view, setView] = useState("list"),
    [kanbanView, setKanbanView] = useState("progress"),
    [tab, setTab] = useState("tasks"),
    [creating, setCreating] = useState(false),
    [status, setStatus] = useState("all"),
    [query, setQuery] = useState(""),
    [selected, setSelected] = useState<string | null>(params.get("task")),
    [month, setMonth] = useState(() =>
      new Date()
        .toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })
        .slice(0, 7),
    );
  const pan = useRef<{
    x: number;
    y: number;
    left: number;
    top: number;
    list: HTMLElement | null;
  } | null>(null);
  const createForm = useRef<HTMLFormElement>(null);
  const [newAssignee, setNewAssignee] = useState("");
  useEffect(() => {
    if (creating) {
      createForm.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      createForm.current
        ?.querySelector<HTMLInputElement>('input[name="title"]')
        ?.focus({ preventScroll: true });
    }
  }, [creating]);
  const lastCardDrag = useRef(0);
  const [dragging, setDragging] = useState<string | null>(null);
  const optimisticTask = useRef<any>(null);
  const snapshotRevision = useRef(0);
  function applySnapshot(b: any) {
    const pending = optimisticTask.current;
    setData(
      pending
        ? {
            ...b,
            tasks: b.tasks.map((t: any) =>
              String(t.id) === String(pending.id) ? pending : t,
            ),
          }
        : b,
    );
  }
  async function load() {
    const revision = snapshotRevision.current;
    const b = await api("/api/tasks");
    if (revision === snapshotRevision.current) applySnapshot(b);
  }
  async function sync(force = true) {
    if (optimisticTask.current) return;
    setBusy(true);
    setError("");
    try {
      const revision = snapshotRevision.current;
      const snapshot = await taskSnapshot(force);
      if (revision === snapshotRevision.current) applySnapshot(snapshot);
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
    void sync(false);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void sync(false);
    }, 60000);
    return () => clearInterval(timer);
  }, []);
  const responsibleOptions = new Map<string, string>();
  for (const u of data?.users || [])
    responsibleOptions.set(
      u.email.toLowerCase(),
      u.display_name || "Funcionário sem nome cadastrado",
    );
  for (const t of data?.tasks || [])
    if (t.assigned_to && !responsibleOptions.has(t.assigned_to.toLowerCase()))
      responsibleOptions.set(
        t.assigned_to.toLowerCase(),
        t.assignee_name || "Funcionário sem nome cadastrado",
      );
  const rows = (data?.tasks || []).filter(
    (t: any) =>
      (!mine ||
        t.is_mine === true ||
        (t.is_mine === undefined &&
          t.assigned_to?.trim().toLowerCase() ===
            data.email?.trim().toLowerCase())) &&
      (!params.get("equipment") || String(t.equipment_id) === params.get("equipment")) &&
      (originFilter === "all" || t.origin === originFilter) &&
      (responsible === "all" ||
        (responsible === "unassigned"
          ? !t.assigned_to
          : t.assigned_to?.toLowerCase() === responsible)) &&
      (status === "all" || status === "active"
        ? status === "all" || t.status !== "completed"
        : taskColumn(t) === status) &&
      (!query ||
        `${t.id} ${t.title} ${t.equipment_name} ${t.customer} ${t.origin} ${t.assignee_name || ""}`
          .toLocaleLowerCase("pt-BR")
          .includes(query.toLocaleLowerCase("pt-BR"))),
  );
  // Stable sorting preserves the existing order within each status group.
  const statusOrder = { overdue: 0, pending: 1, in_progress: 2, completed: 3 };
  rows.sort(
    (a: any, b: any) => statusOrder[taskColumn(a)] - statusOrder[taskColumn(b)],
  );
  function boardColumn(t: any): string {
    if (kanbanView === "responsible")
      return t.assigned_to?.toLowerCase() || "unassigned";
    if (t.status === "completed") return "completed";
    if (kanbanView === "deadline") {
      const today = new Date().toLocaleDateString("sv-SE", {
        timeZone: "America/Sao_Paulo",
      });
      return t.due_date && String(t.due_date).slice(0, 10) < today
        ? "overdue"
        : "on_time";
    }
    return t.status === "in_progress" ? "in_progress" : "pending";
  }
  const boardColumns: [string, string][] =
    kanbanView === "responsible"
      ? [
          ["unassigned", "Não atribuído"],
          ...Array.from(responsibleOptions.entries()).sort((a, b) =>
            a[1].localeCompare(b[1], "pt-BR"),
          ),
        ]
      : kanbanView === "deadline"
        ? [
            ["on_time", "Dentro do prazo"],
            ["overdue", "Atrasado"],
            ["completed", "Concluído"],
          ]
        : [
            ["pending", "Não iniciado"],
            ["in_progress", "Em andamento"],
            ["completed", "Concluído"],
          ];
  if (kanbanView === "responsible") {
    const counts = new Map<string, number>();
    for (const task of rows) {
      const key = boardColumn(task);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    boardColumns.sort((a, b) => {
      if (a[0] === "unassigned") return -1;
      if (b[0] === "unassigned") return 1;
      return (counts.get(b[0]) || 0) - (counts.get(a[0]) || 0) || a[1].localeCompare(b[1], "pt-BR");
    });
  }
  async function dropTask(id: string, column: string) {
    const task = data?.tasks.find((t: any) => String(t.id) === id);
    if (
      !task ||
      busy ||
      task.status === "completed" ||
      boardColumn(task) === column
    )
      return;
    if (kanbanView !== "responsible") {
      if (kanbanView === "deadline" && column !== "completed") {
        setError(
          "A situação do prazo é calculada pela data de vencimento. Abra a tarefa para consultar ou ajustar essa data.",
        );
        return;
      }
      return moveTask(id, column as TaskColumn);
    }
    const assignmentReason = requestAssignmentReason();
    if (assignmentReason === null) return;
    const preview = {
      ...task,
      assigned_to: column === "unassigned" ? null : column,
      assignee_name: responsibleOptions.get(column),
      status: column === "unassigned" ? "not_started" : "in_progress",
      kanban_column: null,
    };
    optimisticTask.current = preview;
    snapshotRevision.current++;
    setData((d: any) => ({
      ...d,
      tasks: d.tasks.map((t: any) => (String(t.id) === id ? preview : t)),
    }));
    setBusy(true);
    setError("");
    try {
      const result = await api("/api/tasks", {
        action: "update",
        assignmentReason,
        id,
        version: task.version,
        assignedTo: column === "unassigned" ? "" : column,
        priority: task.priority,
        automaticPriority: !task.priority_manual,
      });
      optimisticTask.current = null;
      snapshotRevision.current++;
      setData((d: any) => ({
        ...d,
        tasks: d.tasks.map((t: any) =>
          String(t.id) === id ? { ...t, ...result.task } : t,
        ),
      }));
    } catch (e) {
      optimisticTask.current = null;
      setData((d: any) => ({
        ...d,
        tasks: d.tasks.map((t: any) => (String(t.id) === id ? task : t)),
      }));
      setError((e as Error).message);
      await load().catch(() => {});
    } finally {
      setBusy(false);
      setDragging(null);
    }
  }
  async function saveCompletion(task: any, reopen: boolean) {
    if (
      busy ||
      optimisticTask.current ||
      !task.source_key?.startsWith("manual:")
    )
      return;
    const preview = {
      ...task,
      status: reopen ? "not_started" : "completed",
      kanban_column: null,
      completed_at: reopen ? null : new Date().toISOString(),
    };
    snapshotRevision.current++;
    optimisticTask.current = preview;
    setData((previous: any) => ({
      ...previous,
      tasks: previous.tasks.map((t: any) =>
        String(t.id) === String(task.id) ? preview : t,
      ),
    }));
    setBusy(true);
    setError("");
    setDragging(null);
    try {
      const result = await api("/api/tasks", {
        action: reopen ? "reopen" : "move",
        id: String(task.id),
        version: task.version,
        ...(reopen ? {} : { column: "completed" }),
      });
      snapshotRevision.current++;
      optimisticTask.current = null;
      setData((previous: any) => ({
        ...previous,
        tasks: previous.tasks.map((t: any) =>
          String(t.id) === String(task.id) ? { ...t, ...result.task } : t,
        ),
      }));
    } catch (e) {
      snapshotRevision.current++;
      optimisticTask.current = null;
      setData((previous: any) => ({
        ...previous,
        tasks: previous.tasks.map((t: any) =>
          String(t.id) === String(task.id) ? task : t,
        ),
      }));
      setError((e as Error).message);
      await load().catch(() => {});
    } finally {
      snapshotRevision.current++;
      optimisticTask.current = null;
      setBusy(false);
    }
  }
  async function toggleCardCompletion(task: any) {
    if (busy || !task.source_key?.startsWith("manual:")) return;
    const reopen = task.status === "completed";
    if (reopen && !window.confirm("Deseja reabrir esta tarefa?")) return;
    await saveCompletion(task, reopen);
  }
  async function moveTask(id: string, column: TaskColumn) {
    const task = data?.tasks.find((t: any) => String(t.id) === id);
    if (
      !task ||
      busy ||
      (column === "completed" && task.status === "completed")
    )
      return;
    if (column === "completed" && !task.source_key?.startsWith("manual:")) {
      setError(
        "Tarefas de alertas são concluídas automaticamente após a resolução da pendência de origem.",
      );
      setDragging(null);
      return;
    }
    if (column === "completed") return saveCompletion(task, false);
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

    const changed =
      column === "in_progress" &&
      (!task.assigned_to ||
        (assignment === "self" &&
          task.assigned_to.toLowerCase() !== data.email?.toLowerCase()));
    const assignmentReason = changed ? requestAssignmentReason() : undefined;
    if (assignmentReason === null) return;
    const preview = {
      ...task,
      status:
        column === "pending"
          ? "not_started"
          : column === "in_progress"
            ? "in_progress"
            : task.status,
      kanban_column: column,
      ...(changed
        ? {
            assigned_to: data.email,
            assignee_name: responsibleOptions.get(data.email.toLowerCase()),
          }
        : {}),
    };
    optimisticTask.current = preview;
    snapshotRevision.current++;
    setData((d: any) => ({
      ...d,
      tasks: d.tasks.map((t: any) => (String(t.id) === id ? preview : t)),
    }));
    setBusy(true);
    setError("");
    try {
      const result = await api("/api/tasks", {
        action: "move",
        id,
        version: task.version,
        column,
        assignment,
        assignmentReason,
      });
      optimisticTask.current = null;
      snapshotRevision.current++;
      setData((d: any) => ({
        ...d,
        tasks: d.tasks.map((t: any) =>
          String(t.id) === id ? { ...t, ...result.task } : t,
        ),
      }));
    } catch (e) {
      optimisticTask.current = null;
      setData((d: any) => ({
        ...d,
        tasks: d.tasks.map((t: any) => (String(t.id) === id ? task : t)),
      }));
      setError((e as Error).message);
      await load().catch(() => {});
    } finally {
      setBusy(false);
      setDragging(null);
    }
  }
  function open(id: string) {
    setSelected(String(id));
    const query = new URLSearchParams(params.toString());
    query.set("task", id);
    history.replaceState(null, "", "/tarefas?" + query);
  }
  function close() {
    setSelected(null);
    const query = new URLSearchParams(params.toString());
    query.delete("task");
    history.replaceState(null, "", "/tarefas" + (query.size ? "?" + query : ""));
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
        </header>
        {error && (
          <p role="alert" className="task-error">
            {error}
          </p>
        )}
        <nav className="app-section-tabs" aria-label="Seções de tarefas">
          <button
            aria-pressed={tab === "tasks"}
            onClick={() => setTab("tasks")}
          >
            Acompanhamento de tarefas
          </button>
          <button
            aria-pressed={tab === "settings"}
            onClick={() => setTab("settings")}
          >
            Configurações de Tarefas
          </button>
        </nav>
        {tab === "settings" ? (
          <TaskSettings />
        ) : (
          <>
            {creating && (
              <form
                ref={createForm}
                className="task-card"
                onSubmit={async (event) => {
                  event.preventDefault();
                  const fields = new FormData(event.currentTarget);
                  setBusy(true);
                  setError("");
                  try {
                    const result = await api("/api/tasks", {
                      action: "create",
                      ...Object.fromEntries(fields),
                    });
                    setCreating(false);
                    await load();
                    open(String(result.task.id));
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <h2>Nova tarefa manual</h2>
                <div className="task-toolbar">
                  <label>
                    Título
                    <input name="title" required maxLength={160} />
                  </label>
                  <label>
                    Atribuído a
                    <select
                      key={newAssignee}
                      name="assignedTo"
                      defaultValue={newAssignee}
                    >
                      <option value="">Não atribuído</option>
                      {(data?.users || []).map((u: any) => (
                        <option key={u.email} value={u.email}>
                          {u.display_name || "Funcionário sem nome cadastrado"}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Prioridade
                    <select name="priority" defaultValue="normal">
                      {Object.entries(priorityNames).map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Vencimento
                    <input type="date" name="dueDate" />
                  </label>
                </div>
                <label>
                  Descrição
                  <textarea name="description" maxLength={12000} rows={4} />
                </label>
                <div className="task-toolbar">
                  <button disabled={busy} type="submit">
                    Criar tarefa
                  </button>
                  <button
                    disabled={busy}
                    type="button"
                    onClick={() => setCreating(false)}
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            )}
            <div className="task-control-groups">
              <nav
                className="task-toolbar"
                aria-label="Filtros de responsáveis"
              >
                <strong>Responsáveis</strong>
                <button
                  aria-pressed={!mine}
                  onClick={() => {
                    setMine(false);
                    setResponsible("all");
                  }}
                >
                  Últimas tarefas · Todos
                </button>
                <button
                  aria-pressed={mine}
                  onClick={() => {
                    setMine(true);
                    setResponsible("all");
                  }}
                >
                  Minhas tarefas
                </button>
                <button
                  type="button"
                  className="task-new-button"
                  disabled={busy}
                  onClick={() => setCreating(true)}
                >
                  <Plus size={18} aria-hidden="true" /> Nova tarefa
                </button>
              </nav>
              <nav
                className="task-toolbar task-view-controls"
                aria-label="Modo de visualização"
              >
                <strong>Visualização</strong>
                <div className="task-view-segments">
                  {(
                    [
                      ["list", "Lista", List],
                      ["calendar", "Calendário", CalendarDays],
                      ["kanban", "Kanban", Columns3],
                      ["chart", "Gráfico", ChartNoAxesColumnIncreasing],
                    ] as const
                  ).map(([key, label, Icon]) => (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={view === key}
                      onClick={() => setView(key)}
                    >
                      <Icon size={20} strokeWidth={2} aria-hidden="true" />
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
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
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <option value="active">Em aberto</option>
                  <option value="all">Todos</option>
                  {Object.entries(taskColumns).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Responsável
                <select
                  value={
                    mine ? data?.email?.toLowerCase() || "all" : responsible
                  }
                  onChange={(e) => {
                    setMine(false);
                    setResponsible(e.target.value);
                  }}
                >
                  <option value="all">Todos os usuários</option>
                  <option value="unassigned">Não atribuído</option>
                  {[...responsibleOptions.entries()]
                    .sort((a, b) => a[1].localeCompare(b[1], "pt-BR"))
                    .map(([email, name]) => (
                      <option key={email} value={email}>
                        {name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Origem da tarefa
                <select
                  value={originFilter}
                  onChange={(e) => setOriginFilter(e.target.value)}
                >
                  <option value="all">Todas as origens</option>
                  {[
                    ...new Set<string>(
                      (data?.tasks || [])
                        .map((t: any) => t.origin)
                        .filter(Boolean),
                    ),
                  ]
                    .sort((a, b) => a.localeCompare(b, "pt-BR"))
                    .map((origin) => (
                      <option key={origin} value={origin}>
                        {origin}
                      </option>
                    ))}
                </select>
              </label>
              <span>{rows.length} tarefas</span>
            </div>
            {params.get("equipment") && <p className="task-equipment-filter">Tarefas do equipamento: {(data?.tasks || []).find((t: any) => String(t.equipment_id) === params.get("equipment"))?.equipment_name || params.get("equipment")} · <a href="/tarefas">Limpar filtro</a></p>}
            {view === "chart" ? (
              <TaskChart tasks={rows} />
            ) : view === "kanban" ? (
              <>
                <div className="task-kanban-controls">
                  <label>
                    Agrupar Kanban por
                    <select
                      value={kanbanView}
                      onChange={(e) => setKanbanView(e.target.value)}
                    >
                      <option value="progress">Andamento</option>
                      <option value="deadline">Prazo</option>
                      <option value="responsible">Responsável</option>
                    </select>
                  </label>
                  <small>
                    {kanbanView === "deadline"
                      ? "Prazo calculado pelo vencimento. Somente tarefas manuais podem ser arrastadas para Concluído."
                      : kanbanView === "responsible"
                        ? "Arraste para alterar o responsável. Tarefas concluídas permanecem no histórico."
                        : "Arraste os cartões para atualizar o andamento."}
                  </small>
                </div>
                <section
                  className="task-kanban"
                  onPointerDown={(e) => {
                    if (
                      e.button !== 0 ||
                      e.pointerType !== "mouse" ||
                      (e.target as HTMLElement).closest(
                        "button, a, input, select, .task-kanban-card",
                      )
                    )
                      return;
                    const list =
                      (e.target as HTMLElement)
                        .closest(".task-kanban-column")
                        ?.querySelector<HTMLElement>(".task-kanban-cards") ||
                      null;
                    pan.current = {
                      x: e.clientX,
                      y: e.clientY,
                      left: e.currentTarget.scrollLeft,
                      top: list?.scrollTop || 0,
                      list,
                    };
                    e.currentTarget.setPointerCapture(e.pointerId);
                    e.currentTarget.classList.add("is-panning");
                    e.preventDefault();
                  }}
                  onPointerMove={(e) => {
                    if (!pan.current) return;
                    e.currentTarget.scrollLeft =
                      pan.current.left - (e.clientX - pan.current.x);
                    if (pan.current.list)
                      pan.current.list.scrollTop =
                        pan.current.top - (e.clientY - pan.current.y);
                  }}
                  onPointerUp={(e) => {
                    pan.current = null;
                    e.currentTarget.classList.remove("is-panning");
                    if (e.currentTarget.hasPointerCapture(e.pointerId))
                      e.currentTarget.releasePointerCapture(e.pointerId);
                  }}
                  onLostPointerCapture={(e) => {
                    pan.current = null;
                    e.currentTarget.classList.remove("is-panning");
                  }}
                  style={{
                    gridTemplateColumns: `repeat(${boardColumns.length}, minmax(260px, 1fr))`,
                  }}
                  aria-label="Quadro de tarefas"
                >
                  {boardColumns.map(([key, label]) => {
                    const cards = rows.filter(
                      (t: any) => boardColumn(t) === key,
                    );
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
                          void dropTask(id, key);
                        }}
                      >
                        <h2>
                          {label} <span>{cards.length}</span>
                        </h2>
                        <div
                          className="task-kanban-cards"
                          tabIndex={0}
                          aria-label={`Tarefas: ${label}`}
                        >
                          {cards.map((t: any) => (
                            <article
                              key={t.id}
                              className="task-kanban-card"
                              onPointerDown={() => {
                                lastCardDrag.current = 0;
                              }}
                              onClick={(e) => {
                                if (
                                  (e.target as HTMLElement).closest(
                                    "button, a, input, select, textarea",
                                  ) ||
                                  dragging ||
                                  Date.now() - lastCardDrag.current < 250 ||
                                  window.getSelection()?.toString()
                                )
                                  return;
                                open(t.id);
                              }}
                              draggable={!busy && t.status !== "completed"}
                              onDragStart={(e) => {
                                e.dataTransfer.setData(
                                  "text/plain",
                                  String(t.id),
                                );
                                e.dataTransfer.effectAllowed = "move";
                                setDragging(String(t.id));
                              }}
                              onDragEnd={() => {
                                lastCardDrag.current = Date.now();
                                setDragging(null);
                              }}
                            >
                              <div className="task-kanban-title">
                                {t.source_key?.startsWith("manual:") ? (
                                  <button
                                    type="button"
                                    className={
                                      "task-completion-icon " +
                                      (t.status === "completed"
                                        ? "is-completed"
                                        : "")
                                    }
                                    disabled={busy}
                                    aria-label={
                                      t.status === "completed"
                                        ? "Reabrir tarefa"
                                        : "Concluir tarefa"
                                    }
                                    title={
                                      t.status === "completed"
                                        ? "Reabrir tarefa"
                                        : "Concluir tarefa"
                                    }
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      void toggleCardCompletion(t);
                                    }}
                                  >
                                    {t.status === "completed" ? (
                                      <CircleCheck size={19} />
                                    ) : (
                                      <Circle size={19} />
                                    )}
                                  </button>
                                ) : t.status === "completed" ? (
                                  <span
                                    className="task-completion-icon is-completed"
                                    role="img"
                                    aria-label="Tarefa concluída automaticamente"
                                    title="Concluída automaticamente"
                                  >
                                    <CircleCheck size={19} />
                                  </span>
                                ) : null}
                                <button
                                  className="task-link"
                                  onClick={() => open(t.id)}
                                >
                                  TAR-{t.id} · {t.title}
                                </button>
                              </div>
                              <p>{t.equipment_name}</p>
                              <small>{t.origin}</small>
                              <small>
                                {t.assignee_name ||
                                  (t.assigned_to
                                    ? "Funcionário sem nome cadastrado"
                                    : "Não atribuído")}
                              </small>
                              <small>Vencimento: {date(day(t.due_date))}</small>
                              {t.status === "completed" && t.completed_at && (
                                <small>Conclusão: {date(t.completed_at)}</small>
                              )}
                              <span className={"task-priority " + t.priority}>
                                {priorityNames[t.priority]}
                              </span>
                            </article>
                          ))}
                          {!cards.length && (
                            <p className="task-kanban-empty">Nenhuma tarefa</p>
                          )}
                        </div>
                        <button
                          type="button"
                          className="task-kanban-add"
                          disabled={busy}
                          onClick={() => {
                            setNewAssignee(
                              kanbanView === "responsible" &&
                                key !== "unassigned"
                                ? key
                                : "",
                            );
                            setCreating(true);
                            createForm.current?.scrollIntoView({
                              behavior: "smooth",
                              block: "center",
                            });
                          }}
                        >
                          + Adicionar tarefa
                        </button>
                      </section>
                    );
                  })}
                </section>
              </>
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
                          <button
                            className="task-link"
                            onClick={() => open(t.id)}
                          >
                            TAR-{t.id} · {t.title}
                          </button>
                          <small>{t.equipment_name}</small>
                          <small>{t.customer}</small>
                        </td>
                        <td>{t.origin}</td>
                        <td>
                          <button
                            className="task-link"
                            onClick={() => open(t.id)}
                          >
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
                          <TaskStatus task={t} />
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
                  {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map(
                    (d) => (
                      <strong key={d}>{d}</strong>
                    ),
                  )}
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
                              <small>
                                <TaskStatus task={t} />
                              </small>
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
          </>
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
        const b = await taskSnapshot();
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
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 60000);
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
  hourly,
}: {
  equipment: string;
  plan?: string;
  hourly?: boolean;
}) {
  const { tasks, open } = useContext(TaskContext);
  const rows = tasks.filter(
    (t) =>
      t.status !== "completed" &&
      String(t.equipment_id) === String(equipment) &&
      (plan ? t.plan_id === plan || (hourly && t.source_key === `preventive-group:${equipment}`) : !t.plan_id),
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
          TAR-{t.id} · <TaskStatus task={t} />
        </a>
      ))}
      <a href={"/tarefas?equipment=" + encodeURIComponent(equipment)}>Ver todas</a>
    </div>
  );
}
