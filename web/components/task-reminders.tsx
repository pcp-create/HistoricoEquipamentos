"use client";
import { useEffect, useState } from "react";
import {
  parseRecurrence,
  nextOccurrence,
  recurrenceLabel,
} from "@/lib/tasks/recurrence";
import { BellPlus, Pencil, Trash2 } from "lucide-react";
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
  const [editing, setEditing] = useState<any>(null);
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
      const r = await apiFetch("/api/tasks/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, taskId: String(task.id) }),
      });
      const b = await r.json();
      if (!r.ok) throw Error(b.error);
      setOpen(false);
      setEditing(null);
      await load();
      onChanged();
    } catch (e) {
      setRows(before);
      if (body.action !== "cancel") setOpen(true);
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
      {!open && <button
        type="button"
        disabled={busy || task.status === "completed"}
        onClick={() => { setEditing(null); setWhen(""); setFrequency("none"); setError(""); setOpen(true); }}
      >
        <BellPlus size={16} aria-hidden="true" /> Criar alerta
      </button>}
      {open && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save({
              action: editing ? "edit" : "create",
              id: editing?.id,
              expectedWhen: editing ? new Date(editing.scheduled_at).toISOString() : undefined,
              when,
              recurrence,
            });
          }}
        >
          <p>
            Enviar para{" "}
            <strong>{(editing ? editing.recipient_name : task.assignee_name) || "o responsável da tarefa"}</strong>,
            pelo WhatsApp cadastrado. O destinatário é mantido mesmo se o
            responsável da tarefa mudar depois. As pessoas selecionadas em Acompanhamento também recebem o alerta.
          </p>
          {editing && <p>Editar alerta: as alterações valem para este envio e as próximas repetições. A contagem de ocorrências reinicia neste alerta.</p>}
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
            {editing ? "Salvar alerta" : "Agendar alerta"}
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
                    pending: r.attempts > 0 ? "Envio iniciado; aguardando confirmação" : "Agendado",
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
                  <button type="button" className="task-reminder-icon" disabled={busy || r.attempts > 0 || task.status === "completed"} title="Editar alerta" aria-label="Editar alerta" onClick={() => {
                    setEditing(r);
                    setWhen(new Date(new Date(r.scheduled_at).getTime() - 3 * 3600000).toISOString().slice(0,16));
                    setFrequency(r.rule?.frequency || "none");
                    setInterval(r.rule?.interval || 1);
                    setWeekdays(r.rule?.weekdays || [1]);
                    setMonthMode(r.rule?.monthMode || "date");
                    setEnd(r.rule?.end || "never");
                    setUntil(r.rule?.until || "");
                    setCount(r.rule?.count ? Math.max(1,r.rule.count - (r.occurrence_index || 0)) : 10);
                    setError(""); setOpen(true);
                  }}><Pencil size={16} aria-hidden="true" /></button>
                  <button
                    type="button"
                    className="task-reminder-icon"
                    title={r.series_id ? "Cancelar recorrência" : "Cancelar alerta"}
                    aria-label={r.series_id ? "Cancelar recorrência" : "Cancelar alerta"}
                    disabled={busy}
                    onClick={() => void save({ action: "cancel", id: r.id })}
                  >
                    <Trash2 size={16} aria-hidden="true" />
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
