"use client";
import SaveActionIcon from "./save-action-icon";
import { useState } from "react";
import { workingSlots } from "@/lib/service-scheduling/calendar";
import "./schedule-calendar-editor.css";
const days = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];
const iso = (date: Date) => date.toISOString().slice(0, 10);
function Hours({
  value,
  onChange,
}: {
  value: any[];
  onChange: (v: any[]) => void;
}) {
  const fullDay = value.length === 1 && value[0].start === "00:00" && value[0].end === "24:00";
  return (
    <div className="calendar-hours">
      <label className="calendar-radio"><input type="checkbox" checked={fullDay} onChange={(e) => onChange(e.target.checked ? [{start:"00:00",end:"24:00"}] : [{start:"07:30",end:"12:00"},{start:"13:00",end:"18:00"}])}/>24 horas por dia</label>
      {fullDay && <p>Jornada contínua, de 00:00 até 00:00 do dia seguinte.</p>}
      {!fullDay && value.map((h, i) => (
        <div key={i}>
          <input
            type="time"
            aria-label={`Início do período ${i + 1}`}
            value={h.start}
            onChange={(e) =>
              onChange(
                value.map((v, j) =>
                  j === i ? { ...v, start: e.target.value } : v,
                ),
              )
            }
          />
          <span>até</span>
          <input
            type="time"
            aria-label={`Fim do período ${i + 1}`}
            value={h.end}
            onChange={(e) =>
              onChange(
                value.map((v, j) =>
                  j === i ? { ...v, end: e.target.value } : v,
                ),
              )
            }
          />
          <button
            type="button"
            aria-label={`Remover período ${i + 1}`}
            onClick={() => onChange(value.filter((_, j) => i !== j))}
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        disabled={fullDay}
        onClick={() => onChange([...value, { start: "", end: "" }])}
      >
        + Intervalo de trabalho
      </button>
    </div>
  );
}
export default function ScheduleCalendarEditor({
  settings,
  onChange,
  onSave,
  busy,
}: {
  settings: any;
  onChange: (v: any) => void;
  onSave: (v: any) => Promise<boolean>;
  busy: boolean;
}) {
  const [selected, setSelected] = useState("standard"),
    [tab, setTab] = useState("week"),
    [date, setDate] = useState(() =>
      new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }),
    ),
    [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7)),
    [weekdays, setWeekdays] = useState<number[]>([1]),
    [hours, setHours] = useState<any[]>([
      { start: "07:30", end: "12:00" },
      { start: "13:00", end: "18:00" },
    ]),
    [working, setWorking] = useState(true),
    [exception, setException] = useState<any>(null),
    [dirty, setDirty] = useState(false);
  const calendar =
    settings.calendars.find((c: any) => c.id === selected) ||
    settings.calendars[0];
  const update = (next: any) => {
    setDirty(true);
    onChange({
      ...settings,
      calendars: settings.calendars.map((c: any) =>
        c.id === calendar.id ? next : c,
      ),
    });
  };
  const [year, m] = month.split("-").map(Number),
    first = new Date(Date.UTC(year, m - 1, 1)),
    count = new Date(Date.UTC(year, m, 0)).getUTCDate();
  const slots = workingSlots(calendar, date),
    special = (calendar.exceptions || []).find(
      (e: any) => e.startDate <= date && e.endDate >= date,
    );
  function shift(n: number) {
    setMonth(iso(new Date(Date.UTC(year, m - 1 + n, 1))).slice(0, 7));
  }
  return (
    <div className="calendar-editor">
      <div className="calendar-toolbar">
        <label>
          Para o calendário
          <select
            aria-label="Calendário em edição"
            value={calendar.id}
            onChange={(e) => {
              setSelected(e.target.value);
              setException(null);
            }}
          >
            {settings.calendars.map((c: any) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={busy || settings.calendars.length >= 30}
          onClick={() => {
            let name = "Novo calendário";
            let suffix = 2;
            while (settings.calendars.some((c: any) => c.name === name)) name = `Novo calendário ${suffix++}`;
            const base = settings.calendars.find((c: any) => c.id === "standard");
            const next = { id: crypto.randomUUID(), name, week: structuredClone(base?.week || [{day:1,start:"07:30",end:"12:00"}]), exceptions: [] };
            setDirty(true);
            onChange({...settings,calendars:[...settings.calendars,next]});
            setSelected(next.id);
            setException(null);
          }}
        >Novo calendário</button>
        <button
          type="button"
          disabled={busy || settings.calendars.length >= 30}
          onClick={() => {
            const c = {
              ...structuredClone(calendar),
              id: crypto.randomUUID(),
              name: "Cópia de " + calendar.name,
            };
            setDirty(true);
            onChange({ ...settings, calendars: [...settings.calendars, c] });
            setSelected(c.id);
          }}
        >
          Criar cópia
        </button>
        <button
          type="button"
          disabled={calendar.id === "standard"}
          onClick={() => {
            setDirty(true);
            onChange({
              ...settings,
              calendars: settings.calendars.filter(
                (c: any) => c.id !== calendar.id,
              ),
            });
            setSelected("standard");
          }}
        >
          Remover calendário
        </button>
      </div>
      <label className="calendar-name">
        Nome
        <input
          value={calendar.name}
          maxLength={80}
          onChange={(e) => update({ ...calendar, name: e.target.value })}
        />
      </label>
      <div className="calendar-preview">
        <div className="calendar-month">
          <header>
            <button
              type="button"
              aria-label="Mês anterior"
              onClick={() => shift(-1)}
            >
              ‹
            </button>
            <strong>
              {first.toLocaleDateString("pt-BR", {
                month: "long",
                year: "numeric",
                timeZone: "UTC",
              })}
            </strong>
            <button
              type="button"
              aria-label="Próximo mês"
              onClick={() => shift(1)}
            >
              ›
            </button>
          </header>
          <div className="calendar-grid">
            {days.map((d) => (
              <span key={d}>{d.slice(0, 3)}</span>
            ))}
            {Array.from({ length: first.getUTCDay() }, (_, i) => (
              <span key={"empty" + i} />
            ))}
            {Array.from({ length: count }, (_, i) => {
              const value = iso(new Date(Date.UTC(year, m - 1, i + 1))),
                work = workingSlots(calendar, value).length > 0,
                ex = (calendar.exceptions || []).some(
                  (e: any) => e.startDate <= value && e.endDate >= value,
                );
              return (
                <button
                  key={value}
                  type="button"
                  aria-label={value}
                  aria-pressed={value === date}
                  className={`${work ? "working" : "nonworking"} ${ex ? "exception" : ""}`}
                  onClick={() => setDate(value)}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
          <div className="calendar-legend">
            <span>□ Dia útil</span>
            <span>▧ Não útil</span>
            <span>● Exceção</span>
          </div>
        </div>
        <div className="calendar-day">
          <h3>
            {new Date(date + "T12:00:00Z").toLocaleDateString("pt-BR", {
              weekday: "long",
              day: "2-digit",
              month: "long",
              timeZone: "UTC",
            })}
          </h3>
          <p>{special ? special.name : "Semana de trabalho padrão"}</p>
          {slots.length ? (
            <ul>
              {slots.map((h: any, i: number) => (
                <li key={i}>
                  {h.start} – {h.end}
                </li>
              ))}
            </ul>
          ) : (
            <p>Dia não útil</p>
          )}
          <small>
            Horários de Brasília. Intervalos de descanso não consomem duração.
          </small>
          <button
            type="button"
            onClick={() => {
              setTab("exceptions");
              setException({
                name: "",
                startDate: date,
                endDate: date,
                hours: [],
              });
            }}
          >
            Criar exceção nesta data
          </button>
        </div>
      </div>
      <nav className="app-section-tabs">
        <button
          type="button"
          aria-pressed={tab === "week"}
          onClick={() => setTab("week")}
        >
          Semana de trabalho
        </button>
        <button
          type="button"
          aria-pressed={tab === "exceptions"}
          onClick={() => setTab("exceptions")}
        >
          Exceções e feriados
        </button>
      </nav>
      {tab === "week" ? (
        <div className="calendar-week">
          <div>
            <p>Selecione os dias para definir a jornada.</p>
            {days.map((name, day) => (
              <label className="calendar-weekday" key={day}>
                <input
                  type="checkbox"
                  checked={weekdays.includes(day)}
                  onChange={(e) =>
                    setWeekdays(
                      e.target.checked
                        ? [...weekdays, day]
                        : weekdays.filter((v) => v !== day),
                    )
                  }
                />
                <span>{name}</span>
                <small>
                  {calendar.week
                    .filter((w: any) => w.day === day)
                    .map((w: any) => `${w.start}–${w.end}`)
                    .join(" / ") || "Não útil"}
                </small>
              </label>
            ))}
          </div>
          <div>
            <label className="calendar-radio">
              <input
                type="checkbox"
                checked={working}
                onChange={(e) => setWorking(e.target.checked)}
              />
              Dias selecionados são úteis
            </label>
            {working && <Hours value={hours} onChange={setHours} />}
            <button
              type="button"
              disabled={!weekdays.length}
              onClick={() =>
                update({
                  ...calendar,
                  week: [
                    ...calendar.week.filter(
                      (w: any) => !weekdays.includes(w.day),
                    ),
                    ...(working
                      ? weekdays.flatMap((day) =>
                          hours.map((h) => ({ ...h, day })),
                        )
                      : []),
                  ],
                })
              }
            >
              Aplicar aos dias selecionados
            </button>
            <small>Aplique a jornada e depois salve o calendário.</small>
          </div>
        </div>
      ) : (
        <div>
          <div className="scheduling-table">
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Início</th>
                  <th>Fim</th>
                  <th>Jornada</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {(calendar.exceptions || []).map((e: any, i: number) => (
                  <tr key={i}>
                    <td>{e.name}</td>
                    <td>{e.startDate.split("-").reverse().join("/")}</td>
                    <td>{e.endDate.split("-").reverse().join("/")}</td>
                    <td>
                      {e.hours.length
                        ? e.hours
                            .map((h: any) => `${h.start}–${h.end}`)
                            .join(" / ")
                        : "Não útil"}
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={() =>
                          setException({ ...structuredClone(e), index: i })
                        }
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          update({
                            ...calendar,
                            exceptions: calendar.exceptions.filter(
                              (_: any, j: number) => i !== j,
                            ),
                          })
                        }
                      >
                        Remover
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            onClick={() =>
              setException({
                name: "",
                startDate: date,
                endDate: date,
                hours: [],
              })
            }
          >
            + Exceção
          </button>
          {exception && (
            <div className="calendar-exception-form">
              <label>
                Nome da exceção
                <input
                  aria-label="Nome da exceção"
                  value={exception.name}
                  maxLength={120}
                  onChange={(e) =>
                    setException({ ...exception, name: e.target.value })
                  }
                />
              </label>
              <label>
                Início
                <input
                  type="date"
                  value={exception.startDate}
                  onChange={(e) =>
                    setException({ ...exception, startDate: e.target.value })
                  }
                />
              </label>
              <label>
                Fim
                <input
                  type="date"
                  value={exception.endDate}
                  onChange={(e) =>
                    setException({ ...exception, endDate: e.target.value })
                  }
                />
              </label>
              <label className="calendar-radio">
                <input
                  type="checkbox"
                  checked={exception.hours.length > 0}
                  onChange={(e) =>
                    setException({
                      ...exception,
                      hours: e.target.checked
                        ? [{ start: "07:30", end: "12:00" }]
                        : [],
                    })
                  }
                />
                Jornada especial (desmarcado: não útil)
              </label>
              {exception.hours.length > 0 && (
                <Hours
                  value={exception.hours}
                  onChange={(v) => setException({ ...exception, hours: v })}
                />
              )}
              <div>
                <button
                  type="button"
                  onClick={() => {
                    const { index, ...entry } = exception;
                    update({
                      ...calendar,
                      exceptions:
                        index == null
                          ? [...(calendar.exceptions || []), entry]
                          : calendar.exceptions.map((v: any, i: number) =>
                              i === index ? entry : v,
                            ),
                    });
                    setException(null);
                  }}
                >
                  Aplicar exceção
                </button>
                <button type="button" onClick={() => setException(null)}>
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      <footer>
        <span>
          {dirty
            ? "Alterações pendentes de gravação"
            : "Defina os dias úteis e as exceções do calendário."}
        </span>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            if (await onSave(settings)) setDirty(false);
          }}
         aria-label="Salvar calendários" title="Salvar calendários"><SaveActionIcon /></button>
      </footer>
    </div>
  );
}
