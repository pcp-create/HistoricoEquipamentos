"use client";
import { useEffect, useState } from "react";
import { BellPlus } from "lucide-react";
import { apiFetch } from "@/lib/client-api-cache";
export default function TaskReminders({
  task,
  onChanged,
}: {
  task: any;
  onChanged: () => void;
}) {
  const [rows, setRows] = useState<any[]>([]),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function load() {
    const r = await apiFetch("/api/tasks/reminders?taskId=" + task.id);
    const b = await r.json();
    if (!r.ok) throw Error(b.error);
    setRows(b.reminders);
  }
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, [task.id]);
  async function save(body: any) {
    setBusy(true);
    setError("");
    try {
      const r = await apiFetch("/api/tasks/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, taskId: String(task.id) }),
      });
      const b = await r.json();
      if (!r.ok) throw Error(b.error);
      setOpen(false);
      await load();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const date = (v: string) =>
    new Date(v).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  return (
    <section className="task-card">
      <h3>Alertas agendados</h3>
      {error && <p role="alert">{error}</p>}
      <button
        type="button"
        disabled={busy || task.status === "completed"}
        onClick={() => setOpen(true)}
      >
        <BellPlus size={16} aria-hidden="true" /> Criar alerta
      </button>
      {open && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save({
              action: "create",
              when: new FormData(e.currentTarget).get("when"),
            });
          }}
        >
          <p>
            Enviar para{" "}
            <strong>{task.assignee_name || "o responsável da tarefa"}</strong>,
            pelo WhatsApp cadastrado. O destinatário é mantido mesmo se o
            responsável da tarefa mudar depois.
          </p>
          <label>
            Data e hora do alerta (Brasília)
            <input type="datetime-local" name="when" required />
          </label>
          <p>
            A entrega ocorre na próxima verificação do fluxo, executado a cada
            minuto. Alertas de tarefas concluídas não são enviados.
          </p>
          <button type="submit" disabled={busy}>
            Agendar alerta
          </button>{" "}
          <button type="button" disabled={busy} onClick={() => setOpen(false)}>
            Cancelar
          </button>
        </form>
      )}
      {rows.length === 0 ? (
        <p>Nenhum alerta agendado.</p>
      ) : (
        <ul>
          {rows.map((r) => (
            <li key={r.id}>
              <strong>{date(r.scheduled_at)}</strong> ·{" "}
              {r.recipient_name || "Funcionário"}
              <br />
              {
                (
                  {
                    pending: "Agendado",
                    sent: "Enviado",
                    cancelled: "Cancelado",
                    skipped:
                      "Não enviado: tarefa concluída ou destinatário indisponível",
                  } as Record<string, string>
                )[r.state]
              }
              {r.state === "pending" && (
                <>
                  {" "}
                  ·{" "}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void save({ action: "cancel", id: r.id })}
                  >
                    Cancelar alerta
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
