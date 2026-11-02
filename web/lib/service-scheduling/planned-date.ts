import {workingSlots} from './calendar';
import {effectiveOperationStatus} from './model';
import {sameUnit} from '../product-values';
export type PlannedDate = {requiresAttention?:boolean; date:string|null; reason:string; source:'scheduled'|'estimated'|'unknown'|'finished'};
const valid=(d:unknown):d is string=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;
export function nextWorkingDay(date:string,calendar:any):string|null {
 if(!valid(date)||!calendar?.week?.length)return null;
 const at=new Date(date+'T12:00:00Z');
 for(let i=0;i<3660;i++){at.setUTCDate(at.getUTCDate()+1);const d=at.toISOString().slice(0,10);if(workingSlots(calendar,d).some((s:any)=>s.start<s.end))return d;}
 return null;
}
export function plannedDate(input:{schedule:any;materials:any[];external:any[];complete:boolean;calendar:any;today:string}):PlannedDate {
 const {schedule,materials,external,complete,calendar,today}=input;
 const operations=schedule.calendar_operations||[];
 const active=operations.filter((op:any)=>!['completed','reviewed','awaiting_review','cancelled'].includes(op.status));
 const scheduled=active.filter((op:any)=>valid(op.date)&&['scheduled','awaiting_execution','executing'].includes(effectiveOperationStatus(op.status,{...op,responsible:op.responsibleEmail}))).sort((a:any,b:any)=>(a.date+(a.time||'00:00')).localeCompare(b.date+(b.time||'00:00'))||Number(a.position)-Number(b.position));
 if(scheduled.length){const op=scheduled[0];return {date:op.date,source:'scheduled',reason:`Operação ${op.position}${op.time?' às '+op.time:''} já programada${op.date<today?' · Programação vencida':''}.`};}
 if(['Processado','Cancelado','Cancelada'].includes(schedule.order_status)||(operations.length&&!active.length))return {date:null,source:'finished',reason:'Sem operação pendente de programação.'};
 const blockers:string[]=[];
 if(!complete)blockers.push('Aguardando coleta dos materiais da OS');
 const candidates:{date:string;reason:string}[]=[];
 // Aggregate repeated product lines so the same stock is not counted twice.
 const grouped=new Map<string,any>();
 for(const m of materials){
  const key=`${m.item_company}:${m.produto_id}:${m.unidade_nome}`;
  const q=Number(m.quantidade),withdrawn=Number(m.withdrawn||0);
  if(m.quantidade==null||!Number.isFinite(q)||q<0||m.quantity_inconsistency){blockers.push(`${m.produto_nome||m.produto_id}: quantidade a conferir`);continue;}
  const old=grouped.get(key);const needed=Math.max(0,q-withdrawn);
  grouped.set(key,{...m,needed:(old?.needed||0)+needed});
 }
 for(const m of grouped.values()){
  if(m.needed<=0)continue;
  const label=m.produto_nome||`Material ${m.produto_id||'sem código'}`;
  const c=m.current,stock=Number(c?.available);
  if(c?.available==null||!c?.available_at||!Number.isFinite(stock)||!sameUnit(m.unidade_nome,c?.unit)){blockers.push(`${label}: estoque disponível ou unidade não confirmados`);continue;}
  const shortage=m.needed-Math.max(0,stock);if(shortage<=0.000001)continue;
  const p=m.purchases,groups=(p?.groups||[]).filter((g:any)=>sameUnit(m.unidade_nome,g.unit));
  if(!p?.imported||!p.complete){blockers.push(`${label}: coleta de compras incompleta`);continue;}
  if(groups.reduce((n:number,g:any)=>n+Number(g.quantity||0),0)+0.000001<shortage){blockers.push(`${label}: compra pendente insuficiente ou inexistente`);continue;}
  const dates=groups.flatMap((g:any)=>g.deliveryDates);
  if(!dates.length||dates.some((d:any)=>!valid(d)||d<today)){blockers.push(`${label}: prazo de compra ausente ou vencido`);continue;}
  const date=[...dates].sort().at(-1)!;
  candidates.push({date,reason:`Material ${label} · OC ${[...new Set(groups.flatMap((g:any)=>g.orders))].join(', ')} · chegada ${date.split('-').reverse().join('/')}`});
 }
 for(const e of external){if(e.returned_at||e.reconciled_out_at)continue;
  if(!valid(e.expected_at)||e.expected_at<today){blockers.push(`${e.component}: retorno externo sem prazo válido`);continue;}
  candidates.push({date:e.expected_at,reason:`Serviço externo: ${e.component} · retorno ${e.expected_at.split('-').reverse().join('/')}`});
 }
 if(blockers.length)return {date:null,source:'unknown',reason:[...new Set(blockers)].join('; ')};
 const base=candidates.reduce((d,c)=>c.date>d?c.date:d,today);
 const date=nextWorkingDay(base,calendar);
 if(!date)return {date:null,source:'unknown',reason:'Calendário padrão sem dia de trabalho disponível.'};
 const reasons=candidates.filter(c=>c.date===base).map(c=>c.reason);
 return {date,source:'estimated',requiresAttention:candidates.length>0,reason:reasons.length?`${reasons.join('; ')} + 1 dia de trabalho (calendário padrão).`:'Materiais disponíveis, sem serviço externo pendente · próximo dia de trabalho.'};
}
