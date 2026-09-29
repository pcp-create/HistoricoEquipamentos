"use client";
import { useEffect, useRef, useState } from "react";
import { Clock3 } from "lucide-react";
import { createPortal } from "react-dom";
import { scheduleStatusNames } from "@/lib/service-scheduling/model";
import "./schedule-orders-calendar.css";

function Card({ order, day }: {order: any; day: string}) {
  const operations = (order.calendar_operations || []).filter((o: any) => (o.dates || [o.date || ""]).includes(day));
  const people = [...new Set(operations.map((o: any) => o.responsible).filter(Boolean))];
  const starts = operations.map((o:any) => o.allocation?.find((slot:any) => slot.date === day)?.start ||
    (o.date === day && o.time ? day + "T" + o.time + ":00-03:00" : null))
    .filter((value:any) => value && Number.isFinite(Date.parse(value)))
    .sort((a:string,b:string) => Date.parse(a) - Date.parse(b));
  const startTime = starts.length ? new Date(starts[0]).toLocaleTimeString("pt-BR", {timeZone:"America/Sao_Paulo",hour:"2-digit",minute:"2-digit"}) : null;
  const dailyMinutes = operations.map((o:any) => o.allocation?.find((slot:any) => slot.date === day)?.minutes);
  const hasDuration = operations.length > 0 && dailyMinutes.every((minutes:any) => typeof minutes === "number" && Number.isFinite(minutes));
  const minutes = Math.round(dailyMinutes.reduce((total:number,value:any) => total + (value || 0),0));
  const duration = hasDuration ? (Math.floor(minutes / 60) ? Math.floor(minutes / 60) + " h " : "") + (minutes % 60 || !Math.floor(minutes / 60) ? (minutes % 60) + " min" : "") : "—";
  return <a className={"schedule-calendar-order operation-status " + order.programming_status} href={"/programacao?id=" + order.id}>
    <div className="schedule-calendar-card-heading">
      <strong>OS {order.numero_sequencia || order.order_id}</strong>
      <span className="schedule-calendar-duration" title="Duração programada neste dia" aria-label={"Duração programada neste dia: " + duration}><Clock3 size={12} aria-hidden="true"/>{duration}</span>
    </div>
    <span className="schedule-calendar-start"><Clock3 size={12} aria-hidden="true"/> Início: {startTime || "Não informado"}</span>
    <span>{people.join(", ") || "Sem responsável"}</span>
    <span>{order.cliente_nome || "Cliente não informado"}</span>
    <small>{scheduleStatusNames[order.programming_status] || "Pendente"}</small>
  </a>;
}
function DayOrders({ orders, day, onClose }: any) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {dialog.current?.showModal();}, []);
  return createPortal(<dialog className="schedule-calendar-dialog" ref={dialog} onCancel={onClose} aria-label="OSs do dia">
    <header><h2>{day ? day.split("-").reverse().join("/") : "Sem data programada"} · {orders.length} OSs</h2><button onClick={onClose} aria-label="Fechar OSs do dia">×</button></header>
    <div>{orders.map((s:any) => <Card key={s.id} order={s} day={day}/>)}</div>
  </dialog>, document.body);
}
export default function ScheduleOrdersCalendar({ schedules }: {schedules: any[]}) {
  const today = new Intl.DateTimeFormat("en-CA", {timeZone:"America/Sao_Paulo", year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const [month, setMonth] = useState(today.slice(0,7));
  const [opened, setOpened] = useState<string | null>(null);
  const [year, number] = month.split("-").map(Number);
  const start = new Date(Date.UTC(year,number-1,1)).getUTCDay();
  const count = new Date(Date.UTC(year,number,0)).getUTCDate();
  const byDay = new Map<string,any[]>();
  for (const s of schedules) {
    const days = new Set<string>((s.calendar_operations?.length ? s.calendar_operations : [{date:""}]).flatMap((o:any) => o.dates || [o.date || ""]));
    for (const day of days) byDay.set(day,[...(byDay.get(day)||[]),s]);
  }
  function move(delta:number) {setMonth(new Date(Date.UTC(year,number-1+delta,1)).toISOString().slice(0,7));}
  return <section className="schedule-orders-calendar" aria-label="Calendário de OSs">
    <header><button onClick={()=>move(-1)} aria-label="Mês anterior">‹</button>
      <h2 aria-live="polite">{new Date(Date.UTC(year,number-1,1)).toLocaleDateString("pt-BR",{month:"long",year:"numeric",timeZone:"UTC"})}</h2>
      <button onClick={()=>move(1)} aria-label="Próximo mês">›</button>
      <button onClick={()=>setMonth(today.slice(0,7))}>Hoje</button>
    </header>
    <div className="schedule-calendar-legend" aria-label="Legenda de status">{Object.entries(scheduleStatusNames).map(([status,label])=><span key={status} className={"operation-status "+status}>{label}</span>)}</div>
    <div className="schedule-calendar-scroll"><div className="schedule-calendar-month">
      {["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"].map(d=><strong className="schedule-calendar-weekday" key={d}>{d}</strong>)}
      {Array.from({length:start},(_,i)=><div className="schedule-calendar-day empty" key={"empty"+i}/>)}
      {Array.from({length:count},(_,i)=>{
        const day=month+"-"+String(i+1).padStart(2,"0"), orders=byDay.get(day)||[];
        return <div className="schedule-calendar-day" key={day} aria-current={day===today?"date":undefined}>
          <span className="schedule-calendar-day-number">{i+1}</span>
          {orders[0]&&<Card order={orders[0]} day={day}/>}
          {orders.length>1&&<button className="schedule-calendar-more" onClick={()=>setOpened(day)}>+{orders.length-1} OSs</button>}
        </div>;
      })}
    </div></div>
    {!!byDay.get("")?.length && <button className="schedule-calendar-undated" onClick={()=>setOpened("")}>Sem data programada ({byDay.get("")!.length} OSs)</button>}
    {opened!==null&&<DayOrders day={opened} orders={byDay.get(opened)||[]} onClose={()=>setOpened(null)}/>}
  </section>;
}
