"use client";
import { useEffect, useRef, useState } from "react";
import type { SalesVisit } from "@/lib/visits/model";
export default function VisitTaskButton({
  visit,
  customer,
}: {
  visit: SalesVisit;
  customer: string;
}) {
  const [open, setOpen] = useState(false),
    [users, setUsers] = useState<any[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [created, setCreated] = useState("");
  const ref = useRef<HTMLDialogElement>(null),
    request = useRef("");
  useEffect(() => {
    if (!open) return;
    ref.current?.showModal();
    request.current = crypto.randomUUID();
    fetch("/api/tasks")
      .then(async (r) => {
        const b = await r.json();
        if (!r.ok) throw Error(b.error);
        setUsers(b.users || []);
      })
      .catch((e) => setError(e.message));
  }, [open]);
  if(visit.task_id)return <a className="sales-history-button" href={"/tarefas?task="+visit.task_id}>Abrir tarefa TAR-{visit.task_id}</a>;
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError("");
          setOpen(true);
        }}
      >
        Criar tarefa da visita
      </button>
      {created && (
        <a href={"/tarefas?task=" + created}>Abrir tarefa TAR-{created}</a>
      )}
      {open && (
        <dialog
          className="sales-dialog visit-task-dialog"
          aria-label="Criar tarefa da visita"
          ref={ref}
          onCancel={() => setOpen(false)}
        >
          <h2>Criar tarefa da visita</h2>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const b = Object.fromEntries(new FormData(e.currentTarget));
              setBusy(true);
              setError("");
              try {
                const r = await fetch("/api/visits", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      ...b,
                      action: "task",
                      visitId: visit.id,
                      requestId: request.current,
                    }),
                  }),
                  data = await r.json();
                if (!r.ok) throw Error(data.error);
                setCreated(data.taskId);
                setOpen(false);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {error && <p role="alert">{error}</p>}
            <label>
              Título
              <input
                required
                name="title"
                maxLength={160}
                defaultValue={(
                  "Visita - " +
                  customer +
                  (visit.purpose_name ? " - " + visit.purpose_name : "")
                ).slice(0, 160)}
              />
            </label>
            <label>
              Descrição
              <textarea
                aria-label="Descrição"
                required
                name="description"
                maxLength={12000}
                rows={6}
                defaultValue={[
                  `Cliente: ${customer}`,
                  `Visita: ${new Date(visit.completed_at || visit.scheduled_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`,
                  `Contato: ${visit.contact} · ${visit.phone}`,
                  visit.description,
                  visit.outcome,
                ]
                  .filter(Boolean)
                  .join("\n")}
              />
            </label>
            <label>
              Responsável
              <select required name="assignedTo">
                <option value="">Selecione</option>
                {users.map((u) => (
                  <option key={u.email} value={u.email}>
                    {u.display_name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Prioridade
              <select name="priority" defaultValue="normal">
                <option value="normal">Normal</option>
                <option value="high">Alta</option>
                <option value="urgent">Urgente</option>
              </select>
            </label>
            <label>
              Vencimento
              <input required type="date" name="dueDate" />
            </label>
            <p>
              Você será incluído automaticamente no acompanhamento da tarefa e
              da visita.
            </p>
            <button disabled={busy} type="submit">
              Criar tarefa
            </button>
            <button
              disabled={busy}
              type="button"
              onClick={() => setOpen(false)}
            >
              Cancelar
            </button>
          </form>
        </dialog>
      )}
    </>
  );
}
