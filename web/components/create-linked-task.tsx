"use client";
import { useEffect, useRef, useState } from "react";
import { MoreVertical, ClipboardPlus } from "lucide-react";
import { apiFetch } from "@/lib/client-api-cache";
import { TaskDrawer } from "./tasks-dashboard";
import "./create-linked-task.css";
type LinkContext = {
  orderId?: string;
  orderCompany?: number | string;
  equipmentId?: string;
  number?: string;
};
export default function CreateLinkedTask(props: LinkContext) {
  const [creating, setCreating] = useState(false),
    [created, setCreated] = useState<string | null>(null);
  const menu = useRef<HTMLDivElement>(null);
  return (
    <span className="linked-task-actions" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className="linked-task-menu-trigger"
        onClick={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          if (menu.current) {
            menu.current.style.left =
              Math.max(8, Math.min(box.right - 184, window.innerWidth - 200)) +
              "px";
            menu.current.style.top =
              (box.bottom + 60 > window.innerHeight
                ? box.top - 56
                : box.bottom + 4) + "px";
            menu.current.togglePopover();
          }
        }}

        aria-label={
          props.orderId
            ? `Ações da OS ${props.number || props.orderId}`
            : "Ações do equipamento"
        }
        title="Mais ações"
      >
        <MoreVertical size={17} />
      </button>
      <div ref={menu} popover="auto" className="linked-task-menu">
        <button
          type="button"
          onClick={() => {
            menu.current?.hidePopover();
            setCreating(true);
          }}
        >
          <ClipboardPlus size={17} aria-hidden="true"/> Criar tarefa
        </button>
      </div>

      {creating && (
        <LinkedTaskForm
          context={props}
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            setCreated(id);
          }}
        />
      )}
      {created && (
        <TaskDrawer
          id={created}
          onClose={() => setCreated(null)}
          onChanged={() => {}}
        />
      )}
    </span>
  );
}
function LinkedTaskForm({
  context,
  onClose,
  onCreated,
}: {
  context: LinkContext;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    dialog.current?.showModal();
    let alive = true;
    const q = new URLSearchParams();
    for (const k of ["orderId", "orderCompany", "equipmentId"] as const)
      if (context[k]) q.set(k, String(context[k]));
    void apiFetch("/api/tasks/context?" + q)
      .then(async (r) => {
        const b = await r.json();
        if (!r.ok) throw Error(b.error);
        if (alive) setData(b);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [context]);
  return (
    <dialog
      className="linked-task-dialog"
      ref={dialog}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      aria-label="Criar tarefa vinculada"
    >
      <header>
        <h2>Criar tarefa</h2>
        <button
          type="button"
          disabled={busy}
          onClick={onClose}
          aria-label="Fechar criação de tarefa"
        >
          ×
        </button>
      </header>
      {error && <p role="alert">{error}</p>}
      {!data ? (
        <p>Carregando dados do vínculo…</p>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              const fields = Object.fromEntries(new FormData(e.currentTarget));
              const r = await apiFetch("/api/tasks", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  ...fields,
                  action: "create",
                  orderId: context.orderId,
                  orderCompany: context.orderCompany,
                }),
              });
              const b = await r.json();
              if (!r.ok) throw Error(b.error);
              onCreated(String(b.task.id));
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {data.order && (
            <p>
              <strong>OS {data.order.number}</strong> · Empresa{" "}
              {data.order.company_id}
            </p>
          )}
          <p>{data.customer || "Sem cliente informado"}</p>
          <label>
            Título
            <input
              name="title"
              required
              maxLength={160}
              defaultValue={
                data.order
                  ? `Acompanhar OS ${data.order.number}`
                  : `Acompanhar ${data.equipmentName}`
              }
            />
          </label>
          <label>
            Equipamento
            <select name="equipmentId" defaultValue={data.equipment?.id || ""}>
              {!context.equipmentId && (
                <option value="">Vincular somente à OS</option>
              )}
              {data.equipments.map((e: any) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Descrição
            <textarea name="description" maxLength={12000} />
          </label>
          <label>
            Responsável
            <select name="assignedTo" defaultValue="">
              <option value="">Não atribuído</option>
              {data.users.map((u: any) => (
                <option key={u.email} value={u.email}>
                  {u.display_name || "Funcionário sem nome"}
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
            <input type="date" name="dueDate" />
          </label>
          <footer>
            <button disabled={busy} type="submit">
              {busy ? "Criando…" : "Criar tarefa"}
            </button>
            <button disabled={busy} type="button" onClick={onClose}>
              Cancelar
            </button>
          </footer>
        </form>
      )}
    </dialog>
  );
}
