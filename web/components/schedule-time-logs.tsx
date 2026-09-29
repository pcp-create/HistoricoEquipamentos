"use client";
import {useEffect,useState} from 'react';
import {timeLogs,elapsedTime} from '@/lib/service-scheduling/time-logs';
import './schedule-time-logs.css';
const date=(value:string|null)=>value?new Date(value).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):'—';
export default function ScheduleTimeLogs({data}:any){
 const [now,setNow]=useState(Date.now());
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
 const {rows,summary}=timeLogs(data.fieldSessions||[],data.fieldEvents||[],data.events||[],now);
 const cards=[['Apontamentos',String(summary.count)],['Pessoas',String(summary.people)],['Deslocamento',elapsedTime(summary.travel)],['Atividade',elapsedTime(summary.work)],['Paradas',elapsedTime(summary.pause)],['Tempo total',elapsedTime(summary.total)]];
 return <section className="schedule-time-logs" aria-label="Apontamentos da OS">
  <div className="time-log-cards">{cards.map(([label,value])=><div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
  <p>Tempos somados por pessoa · Atividade sem pausas · Total = deslocamento + atividade + paradas. Horários de Brasília.</p>
  {!rows.length&&<p className="time-log-empty">Nenhum apontamento registrado nesta OS.</p>}
  {(data.operations||[]).map((operation:any)=>{
   const items=rows.filter(r=>r.operation_id===operation.id);
   if(!items.length)return null;
   return <section className="time-log-operation" key={operation.id}>
    <h3>Operação {operation.position} · {operation.document.description}</h3>
    <small>{items.length} apontamento(s) · Total {elapsedTime(items.reduce((n,r)=>n+r.total,0))}</small>
    <div className="scheduling-table"><table><thead><tr><th>Pessoa / tipo</th><th>Início</th><th>Fim</th><th>Atividade</th><th>Paradas</th><th>Deslocamento</th><th>Total</th></tr></thead><tbody>
    {items.map(r=><LogRows key={r.id} row={r}/>)}
    </tbody></table></div>
   </section>;
  })}
 </section>;
}
function LogRows({row:r}:any){return <>
 <tr><td><strong>{r.display_name||r.actor}</strong><span className="time-log-secondary">{r.kind==='travel'?'Deslocamento':'Atividade'} · {r.state==='paused'?'Em pausa':r.state==='running'?'Em andamento':'Finalizado'}</span>{r.manual&&<small>Registro manual em {date(r.recorded_at)}. Início e fim não informados.</small>}{r.kind==='travel'&&r.odometer_start!=null&&<small>Odômetro: {Number(r.odometer_start).toLocaleString('pt-BR')} → {r.odometer_end==null?'Em andamento':Number(r.odometer_end).toLocaleString('pt-BR')} km</small>}</td>
 <td>{date(r.started_at)}</td><td>{r.manual?'—':r.finished_at?date(r.finished_at):'Em andamento'}</td><td>{r.kind==='work'?elapsedTime(r.active):'—'}</td><td>{elapsedTime(r.pause)}</td><td>{r.kind==='travel'?elapsedTime(r.active):'—'}</td><td><strong>{elapsedTime(r.total)}</strong></td></tr>
 {r.pauses.map((p:any,i:number)=><tr className="time-log-pause" key={i}><td>Pausa · {p.reason}<small>{r.display_name||r.actor}</small></td><td>{date(p.start)}</td><td>{p.end?date(p.end):'Em pausa'}</td><td>—</td><td>{elapsedTime(p.seconds)}</td><td>—</td><td><small>Incluída no total acima</small></td></tr>)}
 </>;}
