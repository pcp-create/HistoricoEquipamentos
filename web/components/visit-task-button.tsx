"use client";
import {ArrowRightLeft} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { SalesVisit } from "@/lib/visits/model";
export default function VisitTaskButton({
  visit,
  customer, initialOpen=false, onClosed,
}: {
  visit: SalesVisit;
  customer: string;
  initialOpen?:boolean;onClosed?:()=>void;
}) {
  const [open, setOpen] = useState(initialOpen),
    [users, setUsers] = useState<any[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [created, setCreated] = useState(""),
    [directedTo,setDirectedTo]=useState(visit.task_directed_to||"");
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

  const taskStatus=created?"not_started":visit.task_status;
  const statusNames:Record<string,string>={not_started:"Não iniciada",in_progress:"Em andamento",completed:"Concluída"};
  return (
    <>
      <div className="visit-task-reference">
      {(created||visit.task_id)&&<a href={"/tarefas?task="+(created||visit.task_id)}>TAR-{created||visit.task_id}</a>}
      {taskStatus&&(created||visit.task_id)&&<span className="visit-task-separator" aria-hidden="true">•</span>}
      {taskStatus&&<span className={"visit-task-status visit-task-status--"+taskStatus}>{statusNames[taskStatus]||taskStatus}</span>}
      {directedTo&&(taskStatus||created||visit.task_id)&&<span className="visit-task-separator" aria-hidden="true">•</span>}
      {directedTo&&<span>Direcionado a {directedTo}</span>}
      {!directedTo&&<button
        className="sales-visit-task-direct"
        title="Direcionar tarefa da visita"
        type="button"
        onClick={() => {
          setError("");
          setOpen(true);
        }}
      >
        <ArrowRightLeft size={14} aria-hidden="true"/>Direcionar tarefa
      </button>}
      </div>

      {open && (
        <dialog
          className="sales-dialog visit-task-dialog"
          aria-label="Direcionar tarefa da visita"
          ref={ref}
          onCancel={e => {if(busy){e.preventDefault();return;}setOpen(false);onClosed?.();}}
        >
          <h2>Direcionar tarefa da visita</h2>
          <p>{created||visit.task_id?`TAR-${created||visit.task_id} · `:''}O número e o histórico da tarefa serão mantidos. Se estiver concluída, a mesma tarefa será reaberta.</p>
          {initialOpen&&<p>A visita foi registrada. A tarefa ficará aberta para tratar a pendência, mesmo se você fechar esta janela antes de direcioná-la.</p>}
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
                      description:[b.description,b.reason?`Pendência / demanda: ${b.reason}`:''].filter(Boolean).join('\n\n'),
                      followTask: b.followTask === "on",
                      action: "task",
                      visitId: visit.id,
                      requestId: request.current,
                    }),
                  }),
                  data = await r.json();
                if (!r.ok) throw Error(data.error);
                setCreated(data.taskId);
                setDirectedTo(users.find(u=>u.email===b.assignedTo)?.display_name||String(b.assignedTo));
                setOpen(false);onClosed?.();
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
                maxLength={9000}
                rows={6}
                defaultValue={[
                  `Cliente: ${customer}`,
                  `Visita: ${new Date(visit.completed_at || visit.scheduled_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`,
                  `Contato: ${visit.contact} · ${visit.phone}`,
                  visit.description,
                  visit.outcome,
                ]
                  .filter(Boolean)
                  .join("\n").slice(0,9000)}
              />
            </label>
            {visit.status==='completed'&&<label>Motivo / demanda<textarea required name="reason" maxLength={2000} rows={3}/></label>}
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
            <label className="visit-task-follow"><input type="checkbox" name="followTask" defaultChecked/>Acompanhar esta tarefa e receber atualizações</label>
            <div className="visit-task-actions">
            <button className="sales-primary" disabled={busy} type="submit">
              <ArrowRightLeft size={17} aria-hidden="true"/>{busy?'Direcionando…':'Direcionar tarefa'}
            </button>
            <button
              disabled={busy}
              type="button"
              onClick={() => {setOpen(false);onClosed?.();}}
            >
              Cancelar
            </button>
            </div>
          </form>
        </dialog>
      )}
    </>
  );
}
