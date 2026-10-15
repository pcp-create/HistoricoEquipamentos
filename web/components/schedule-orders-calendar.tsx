"use client";
import { Fragment, useEffect, useRef, useState } from "react";
import { Clock3 } from "lucide-react";
import { createPortal } from "react-dom";
import { scheduleStatusNames, statusNames } from "@/lib/service-scheduling/model";
import "./schedule-orders-calendar.css";
import "./schedule-status-colors.css";

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
export function DayOrders({ orders, day, onClose }: any) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {dialog.current?.showModal();}, []);
  return createPortal(<dialog className="schedule-calendar-dialog" ref={dialog} onCancel={onClose} aria-label="OSs do dia">
    <header><h2>{day ? day.split("-").reverse().join("/") : "Sem data programada"} · {orders.length} OSs</h2><button onClick={onClose} aria-label="Fechar OSs do dia">×</button></header>
    <div>{orders.map((s:any) => <Card key={s.id} order={s} day={day}/>)}</div>
  </dialog>, document.body);
}

function shiftDay(day: string, count: number) {
  const date = new Date(day + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}
function weekNumber(day: string) {
  const date = new Date(day + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  return Math.ceil(((date.getTime() - Date.UTC(date.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7);
}
const dateLabel = (day: string) => day.split("-").reverse().join("/");
const dayOperations = (order: any, day: string) => (order.calendar_operations || []).filter((o:any) => (o.dates || [o.date || ""]).includes(day));
function operationTime(operation: any, day: string) {
  const start = operation.allocation?.find((slot:any) => slot.date === day)?.start;
  return start ? new Date(start).toLocaleTimeString("pt-BR", {timeZone:"America/Sao_Paulo",hour:"2-digit",minute:"2-digit"})
    : operation.date === day ? operation.time || "" : "";
}
function DailySchedule({orders,day,users,vehicles}:any) {
  const rows = orders.flatMap((order:any) => dayOperations(order,day).map((operation:any) => ({order,operation})))
    .sort((a:any,b:any) => (operationTime(a.operation,day)||"99:99").localeCompare(operationTime(b.operation,day)||"99:99") ||
      (a.operation.responsible || "").localeCompare(b.operation.responsible || "", "pt-BR"));
  const name = (email:string) => users.find((u:any)=>u.email===email)?.display_name || email;
  return <div className="schedule-daily">
    <p>{orders.length} OSs · {rows.length} operações programadas para {dateLabel(day)}</p>
    {!rows.length ? <p>Nenhum serviço programado para este dia.</p> :
    <div className="schedule-calendar-scroll"><table className="schedule-daily-table">
      <thead><tr>{["Horário / duração","Executante / apoio","OS / atividade","Cliente / local","Equipamento","Observações internas","Veículo"].map(label=><th key={label}>{label}</th>)}</tr></thead>
      <tbody>{rows.map(({order,operation}:any,index:number)=>{
        const minutes=operation.allocation?.find((slot:any)=>slot.date===day)?.minutes;
        const vehicle=vehicles.find((v:any)=>v.id===operation.vehicleId)?.name;
        return <tr key={order.id+":"+(operation.id || index)}>
          <td><strong>{operationTime(operation,day)||"Sem horário"}</strong><small>{typeof minutes==="number" ? (minutes/60).toLocaleString("pt-BR",{maximumFractionDigits:2})+" h neste dia" : "Duração diária não informada"}</small></td>
          <td><strong>{operation.responsible || name(operation.responsibleEmail) || "Sem responsável"}</strong>{!!operation.support?.length && <small>Apoio: {operation.support.map(name).join(", ")}</small>}</td>
          <td><a href={"/programacao?id="+order.id}>OS {order.numero_sequencia || order.order_id}</a><strong>{operation.description || "Atividade não informada"}</strong><span className={"operation-status "+operation.status}>{statusNames[operation.status] || "Pendente"}</span></td>
          <td>{order.cliente_nome || "Cliente não informado"}<small>{[order.customer_city,order.customer_state].filter(Boolean).join(" / ") || "Local não informado"}</small></td>
          <td>{order.equipamento || "Não informado"}</td>
          <td className="schedule-daily-note">{operation.internalNote || "—"}</td>
          <td>{vehicle || (operation.vehicleId ? "Veículo não disponível" : "Não definido")}</td>
        </tr>;
      })}</tbody>
    </table></div>}
  </div>;
}
export default function ScheduleOrdersCalendar({ schedules, users=[], vehicles=[] }: {schedules: any[]; users?:any[]; vehicles?:any[]}) {
  const today = new Intl.DateTimeFormat("en-CA", {timeZone:"America/Sao_Paulo", year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const [selected,setSelected]=useState(today);
  const [view,setView]=useState<"month"|"week"|"day">("month");
  const [opened, setOpened] = useState<string | null>(null);
  const month=selected.slice(0,7);
  const [year, number] = month.split("-").map(Number);
  const start = new Date(Date.UTC(year,number-1,1)).getUTCDay();
  const count = new Date(Date.UTC(year,number,0)).getUTCDate();
  const first=month+"-01";
  const weekStart=shiftDay(selected,-new Date(selected+"T12:00:00Z").getUTCDay());
  const weekDays=Array.from({length:7},(_,i)=>shiftDay(weekStart,i));
  const byDay = new Map<string,any[]>();
  for (const s of schedules) {
    const days = new Set<string>((s.calendar_operations?.length ? s.calendar_operations : [{date:""}]).flatMap((o:any) => o.dates || [o.date || ""]));
    for (const day of days) byDay.set(day,[...(byDay.get(day)||[]),s]);
  }
  function move(delta:number) {
    setSelected(view==="month" ? new Date(Date.UTC(year,number-1+delta,1)).toISOString().slice(0,10) : shiftDay(selected,delta*(view==="week"?7:1)));
  }
  function openDay(day:string) {setSelected(day);setView("day");}
  const heading=view==="month" ? new Date(Date.UTC(year,number-1,1)).toLocaleDateString("pt-BR",{month:"long",year:"numeric",timeZone:"UTC"})
    : view==="week" ? dateLabel(weekStart)+" a "+dateLabel(weekDays[6]) : "Programação de "+dateLabel(selected);
  return <section className="schedule-orders-calendar" aria-label="Calendário de OSs">
    <nav className="schedule-calendar-views" aria-label="Período do calendário">{([["month","Mês"],["week","Semana"],["day","Dia"]] as const).map(([key,label])=><button key={key} aria-pressed={view===key} onClick={()=>setView(key)}>{label}</button>)}</nav>
    <header><button onClick={()=>move(-1)} aria-label={view==="month"?"Mês anterior":view==="week"?"Semana anterior":"Dia anterior"}>‹</button>
      <h2 aria-live="polite">{heading}</h2>
      <button onClick={()=>move(1)} aria-label={view==="month"?"Próximo mês":view==="week"?"Próxima semana":"Próximo dia"}>›</button>
      <button onClick={()=>setSelected(today)}>Hoje</button>
    </header>
    {view==="month" && <div className="schedule-calendar-scroll"><div className="schedule-calendar-month">
      <strong className="schedule-calendar-weekday" title="Número ISO da semana (segunda a domingo)">Sem.</strong>
      {["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"].map(d=><strong className="schedule-calendar-weekday" key={d}>{d}</strong>)}
      {Array.from({length:Math.ceil((start+count)/7)},(_,row)=>{
        const rowStart=shiftDay(first,row*7-start);
        return <Fragment key={rowStart}>
          <button type="button" className="schedule-calendar-week-number"
            title={"Abrir semana de "+dateLabel(rowStart)+" a "+dateLabel(shiftDay(rowStart,6))}
            aria-label={"Ver semana de "+dateLabel(rowStart)+" a "+dateLabel(shiftDay(rowStart,6))}
            onClick={()=>{setSelected(rowStart);setView("week");}}>
            {weekNumber(shiftDay(rowStart,1))}
          </button>
          {Array.from({length:7},(_,column)=>{
            const day=shiftDay(rowStart,column),orders=byDay.get(day)||[];
            return day.slice(0,7)!==month ? <div className="schedule-calendar-day empty" key={day}/> :
            <div className="schedule-calendar-day" key={day} aria-current={day===today?"date":undefined}>
              <span className="schedule-calendar-day-number">{Number(day.slice(8))}</span>
              {orders[0]&&<Card order={orders[0]} day={day}/>}
              {orders.length>1&&<button className="schedule-calendar-more" onClick={()=>setOpened(day)}>+{orders.length-1} OSs</button>}
            </div>;
          })}
        </Fragment>;
      })}
    </div></div>}
    {view==="week" && <div className="schedule-calendar-scroll"><div className="schedule-calendar-week">
      {weekDays.map(day=><section className="schedule-week-day" key={day} aria-label={dateLabel(day)}>
        <button className="schedule-week-heading" onClick={()=>openDay(day)} aria-label={"Ver programação de "+dateLabel(day)}>
          {new Date(day+"T12:00:00Z").toLocaleDateString("pt-BR",{weekday:"short",timeZone:"UTC"})} {dateLabel(day).slice(0,5)}
          <small>{(byDay.get(day)||[]).length} OSs</small>
        </button>
        {(byDay.get(day)||[]).map(order=><Card key={order.id} order={order} day={day}/>)}
        {!byDay.get(day)?.length&&<small>Sem serviços</small>}
      </section>)}
    </div></div>}
    {view==="day"&&<DailySchedule orders={byDay.get(selected)||[]} day={selected} users={users} vehicles={vehicles}/>}
    <div className="schedule-calendar-legend" aria-label="Legenda de status">
      {Object.entries(scheduleStatusNames).map(([status,label])=><span key={status}>
        <i className={"schedule-calendar-legend-dot operation-status "+status} aria-hidden="true"/>{label}
      </span>)}
    </div>
    {opened!==null&&<DayOrders day={opened} orders={byDay.get(opened)||[]} onClose={()=>setOpened(null)}/>}
  </section>;
}
