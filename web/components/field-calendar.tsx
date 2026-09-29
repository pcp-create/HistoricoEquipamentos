"use client";
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { fieldOperationOverdue } from "@/lib/service-scheduling/field-overdue";

export function fieldToday(now: number) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(now));
}
export default function FieldCalendar({ rows, selected, onSelect, now }: {
  rows: any[]; selected: string; onSelect: (day: string) => void; now: number;
}) {
  const today = fieldToday(now);
  const [month, setMonth] = useState((selected || today).slice(0, 7));
  const [year, number] = month.split("-").map(Number);
  const first = new Date(Date.UTC(year, number - 1, 1)).getUTCDay();
  const count = new Date(Date.UTC(year, number, 0)).getUTCDate();
  const title = new Date(Date.UTC(year, number - 1, 1)).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
  function move(delta: number) {
    const next = new Date(Date.UTC(year, number - 1 + delta, 1)).toISOString().slice(0, 7);
    setMonth(next);
    onSelect(next + "-01");
  }
  return <section className="field-calendar" aria-label="Calendário da programação">
    <div className="field-calendar-heading">
      <button aria-label="Mês anterior" onClick={() => move(-1)}><ChevronLeft size={18}/></button>
      <strong aria-live="polite">{title}</strong>
      <button aria-label="Próximo mês" onClick={() => move(1)}><ChevronRight size={18}/></button>
      <button onClick={() => {setMonth(today.slice(0, 7)); onSelect(today);}}>Hoje</button>
    </div>
    <div className="field-calendar-grid">
      {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map(day => <span className="field-calendar-weekday" key={day}>{day}</span>)}
      {Array.from({length: first}, (_, i) => <span key={"blank" + i}/>)}
      {Array.from({length: count}, (_, i) => {
        const day = month + "-" + String(i + 1).padStart(2, "0");
        const items = rows.filter(row => row.date === day);
        const orders = new Set(items.map(row => row.schedule_id)).size;
        const overdue = items.some(row => fieldOperationOverdue(row.date, row.status, now));
        return <button key={day} aria-pressed={selected === day} aria-current={day === today ? "date" : undefined}
          aria-label={day.split("-").reverse().join("/") + ": " + orders + " OSs"}
          className={overdue ? "field-calendar-overdue" : ""}
          onClick={() => onSelect(day)}>
          <span>{i + 1}</span>{orders > 0 && <small>{orders} OS{orders > 1 ? "s" : ""}</small>}
        </button>;
      })}
    </div>
    {rows.some(row => !row.date) && <button className="field-calendar-undated" aria-pressed={selected === ""} onClick={() => onSelect("")}>Sem data programada</button>}
    <p className="field-calendar-selected" aria-live="polite">{selected ? "Programação de " + selected.split("-").reverse().join("/") : "Sem data programada"}</p>
  </section>;
}
