"use client";
import { useEffect, useState } from "react";
export default function WorkshopCreateTask({
  visitId,
  onCreated,
  onCancel,
  onBusy,
}: {
  visitId: string;
  onCreated: (id: string) => void;
  onCancel: () => void;
  onBusy: (busy: boolean) => void;
}) {
  const [context, setContext] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [type, setType] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/tasks/context?workshopVisitId=" + encodeURIComponent(visitId), {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (r) => {
        const b = await r.json();
        if (!r.ok)
          throw Error(b.error || "Não foi possível carregar os dados.");
        return b;
      })
      .then(setContext)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [visitId]);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setBusy(true);
    onBusy(true);
    setError("");
    try {
      const r = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          ...Object.fromEntries(fields),
          workshopVisitId: visitId,
        }),
      });
      const b = await r.json();
      if (!r.ok) throw Error(b.error || "Não foi possível criar a tarefa.");
      onCreated(String(b.task.id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }
  return (
    <form onSubmit={submit}>
      {error && (
        <p role="alert" className="ws-error">
          {error}
        </p>
      )}
      {!context ? (
        !error && <p role="status">Carregando os dados da tarefa…</p>
      ) : (
        <>
          <div className="ws-task-context">
            <strong>{context.equipmentName}</strong>
            <p>Cliente: {context.customer || "Não informado"}</p>
            <small>
              {[
                context.workshop?.workshop,
                context.workshop?.model,
                context.workshop?.serial,
              ]
                .filter(Boolean)
                .join(" · ")}
            </small>
          </div>
          <fieldset disabled={busy}>
            <label>
              Tipo de tarefa
              <select
                name="taskType"
                required
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                <option value="">Selecione o tipo</option>
                <option value="standard">Tarefa normal</option>
                <option value="approval">Tarefa de aprovação</option>
              </select>
            </label>
            {type === "approval" && (
              <p>
                O responsável recebe a solicitação de aprovação. A decisão
                retorna ao solicitante; reprovações exigem justificativa.
              </p>
            )}
            <label>
              Título
              <input
                name="title"
                required
                maxLength={160}
                defaultValue={("Oficina · " + context.equipmentName).slice(
                  0,
                  160,
                )}
              />
            </label>
            <div className="ws-form-grid">
              <label>
                {type === "approval"
                  ? "Responsável pela aprovação"
                  : "Atribuído a"}
                <select
                  name="assignedTo"
                  required={type === "approval"}
                  defaultValue=""
                >
                  <option value="">
                    {type === "approval"
                      ? "Selecione o responsável"
                      : "Não atribuído"}
                  </option>
                  {context.users.map((u: any) => (
                    <option key={u.email} value={u.email}>
                      {u.display_name || u.email}
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
            </div>
            <label>
              Descrição
              <textarea
                name="description"
                required={type === "approval"}
                maxLength={12000}
                rows={4}
              />
            </label>
            <p className="ws-helper">
              A máquina, o cliente e a entrada na oficina serão vinculados
              automaticamente à tarefa.
            </p>
          </fieldset>
        </>
      )}
      <footer>
        <button type="button" disabled={busy} onClick={onCancel}>
          Cancelar
        </button>
        <button
          className="ws-primary"
          type="submit"
          disabled={busy || !context || !type}
        >
          {busy ? "Criando…" : "Criar tarefa"}
        </button>
      </footer>
    </form>
  );
}
