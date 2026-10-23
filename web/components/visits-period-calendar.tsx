"use client";
import { useState } from "react";
import { brazilDay, type SalesVisit } from "@/lib/visits/model";
export default function VisitsPeriodCalendar({
  visits,
  renderVisit,
  mode,
}: {
  visits: SalesVisit[];
  renderVisit: (v: SalesVisit) => React.ReactNode;
  mode: "week" | "day";
}) {
  const [anchor, setAnchor] = useState(() => brazilDay(new Date()));
  const plus = (s: string, n: number) =>
    new Date(Date.parse(s + "T12:00:00Z") + n * 86400000)
      .toISOString()
      .slice(0, 10);
  const start =
    mode === "day"
      ? anchor
      : plus(anchor, -((new Date(anchor + "T12:00:00Z").getUTCDay() + 6) % 7));
  const days = Array.from({ length: mode === "day" ? 1 : 7 }, (_, i) =>
    plus(start, i),
  );
  return (
    <section className="visit-period">
      <div className="sales-actions">
        <button
          aria-label="Período anterior"
          onClick={() => setAnchor(plus(anchor, mode === "day" ? -1 : -7))}
        >
          ‹
        </button>
        <input
          aria-label="Data do calendário"
          type="date"
          value={anchor}
          onChange={(e) => {
            if (e.target.value) setAnchor(e.target.value);
          }}
        />
        <button
          aria-label="Próximo período"
          onClick={() => setAnchor(plus(anchor, mode === "day" ? 1 : 7))}
        >
          ›
        </button>
        <button onClick={() => setAnchor(brazilDay(new Date()))}>Hoje</button>
      </div>
      <div className={"visit-period-grid " + mode}>
        {days.map((day) => (
          <section key={day}>
            <h3>
              {new Date(day + "T12:00:00Z").toLocaleDateString("pt-BR", {
                weekday: "short",
                day: "2-digit",
                month: "2-digit",
                timeZone: "UTC",
              })}
            </h3>
            {visits
              .filter((v) => brazilDay(v.scheduled_at) === day)
              .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))
              .map(renderVisit)}
            {!visits.some((v) => brazilDay(v.scheduled_at) === day) && (
              <p>Sem visitas</p>
            )}
          </section>
        ))}
      </div>
    </section>
  );
}
