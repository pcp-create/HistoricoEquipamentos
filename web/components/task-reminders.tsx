"use client";
import { useEffect, useState } from "react";
import {
  parseRecurrence,
  nextOccurrence,
  recurrenceLabel,
} from "@/lib/tasks/recurrence";
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
  const [when, setWhen] = useState(""),
    [frequency, setFrequency] = useState("none"),
    [interval, setInterval] = useState(1),
    [weekdays, setWeekdays] = useState<number[]>([1]),
    [end, setEnd] = useState("never"),
    [until, setUntil] = useState(""),
    [count, setCount] = useState(10),
    [monthMode, setMonthMode] = useState("date");
  const recurrence =
    frequency === "none"
      ? null
      : {
          frequency: frequency === "weekdays" ? "weekly" : frequency,
          interval: frequency === "weekdays" ? 1 : interval,
          weekdays: frequency === "weekdays" ? [1, 2, 3, 4, 5] : weekdays,
          monthMode,
          end,
          until,
          count,
        };
  let preview: string[] = [],
    summary = "",
    validation = "";
  if (when && recurrence) {
    try {
      const rule = parseRecurrence(recurrence, when)!;
      summary = recurrenceLabel(rule);
      preview = [new Date(when + "-03:00").toISOString()];
      let index = 0;
      for (let i = 0; i < 3; i++) {
        const next = nextOccurrence(when, rule, index);
        if (!next) break;
        preview.push(next.when);
        index = next.index;
      }
    } catch (e) {
      validation = (e as Error).message;
    }
  }
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
    const before = rows;
    setBusy(true);
    setError("");
    try {
      if (body.action === "cancel")
        setRows(
          rows.map((r) =>
            r.id === body.id ? { ...r, state: "cancelled" } : r,
          ),
        );
      else {
        setOpen(false);
        setRows([
          {
            id: "saving",
            scheduled_at: new Date(body.when + "-03:00").toISOString(),
            state: "pending",
            recipient_name: task.assignee_name,
            rule: recurrence ? parseRecurrence(recurrence, when) : null,
          },
          ...rows,
        ]);
      }
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
      setRows(before);
      if (body.action === "create") setOpen(true);
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
              when,
              recurrence,
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
            <input
              type="datetime-local"
              name="when"
              required
              value={when}
              onChange={(e) => {
                setWhen(e.target.value);
                if (e.target.value && frequency === "weekly")
                  setWeekdays([new Date(e.target.value + "Z").getUTCDay()]);
              }}
            />
          </label>
          <div className="reminder-recurrence">
            <label>
              Recorrência
              <select
                aria-label="Recorrência"
                value={frequency}
                onChange={(e) => {
                  setFrequency(e.target.value);
                  if (e.target.value === "weekly" && when)
                    setWeekdays([new Date(when + "Z").getUTCDay()]);
                }}
              >
                <option value="none">Não repetir</option>
                <option value="daily">Diária</option>
                <option value="weekdays">Dias úteis (segunda a sexta)</option>
                <option value="weekly">Semanal</option>
                <option value="monthly">Mensal</option>
                <option value="yearly">Anual</option>
              </select>
            </label>
            {frequency !== "none" && (
              <>
                {frequency !== "weekdays" && (
                  <label>
                    Repetir a cada
                    <input
                      type="number"
                      min="1"
                      max="99"
                      required
                      value={interval}
                      onChange={(e) => setInterval(Number(e.target.value))}
                    />
                    <small>
                      {
                        {
                          daily: "dia(s)",
                          weekly: "semana(s)",
                          monthly: "mês(es)",
                          yearly: "ano(s)",
                        }[frequency]
                      }
                    </small>
                  </label>
                )}
                {frequency === "weekly" && (
                  <fieldset>
                    <legend>Dias da semana</legend>
                    <div className="reminder-weekdays">
                      {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map(
                        (day, index) => (
                          <label key={day}>
                            <input
                              type="checkbox"
                              checked={weekdays.includes(index)}
                              onChange={(e) =>
                                setWeekdays(
                                  e.target.checked
                                    ? [...weekdays, index]
                                    : weekdays.filter((d) => d !== index),
                                )
                              }
                            />
                            {day}
                          </label>
                        ),
                      )}
                    </div>
                  </fieldset>
                )}
                {frequency === "monthly" && (
                  <label>
                    Repetir no
                    <select
                      value={monthMode}
                      onChange={(e) => setMonthMode(e.target.value)}
                    >
                      <option value="date">Mesmo dia do mês</option>
                      <option value="last_day">Último dia do mês</option>
                    </select>
                  </label>
                )}
                {["monthly", "yearly"].includes(frequency) && (
                  <small>
                    Se o dia não existir no mês, será usado o último dia. A
                    primeira ocorrência mantém a data escolhida acima.
                  </small>
                )}
                <label>
                  Termina
                  <select aria-label="Termina" value={end} onChange={(e) => setEnd(e.target.value)}>
                    <option value="never">Sem data final</option>
                    <option value="until">Em uma data</option>
                    <option value="count">Após um número de ocorrências</option>
                  </select>
                </label>
                {end === "until" && (
                  <label>
                    Data final (inclusive)
                    <input
                      type="date"
                      required
                      min={when.slice(0, 10)}
                      value={until}
                      onChange={(e) => setUntil(e.target.value)}
                    />
                  </label>
                )}
                {end === "count" && (
                  <label>
                    Ocorrências (incluindo o primeiro alerta)
                    <input
                      type="number"
                      min="1"
                      max="1000"
                      required
                      value={count}
                      onChange={(e) => setCount(Number(e.target.value))}
                    />
                  </label>
                )}
                {validation && <p role="alert">{validation}</p>}
                {preview.length > 0 && (
                  <div className="reminder-preview">
                    <strong>{summary}</strong>
                    <small>Próximas ocorrências (Brasília)</small>
                    <ul>
                      {preview.map((d) => (
                        <li key={d}>{date(d)}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </div>
          <p>
            A entrega ocorre na próxima verificação do fluxo, executado a cada
            minuto. A recorrência é encerrada quando a tarefa é concluída. Se o
            fluxo atrasar, as repetições vencidas são puladas após o envio
            pendente, evitando mensagens acumuladas.
          </p>
          <button type="submit" disabled={busy || !!validation}>
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
              {r.rule && <small>{recurrenceLabel(r.rule)}</small>}
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
                    {r.series_id ? "Cancelar recorrência" : "Cancelar alerta"}
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
