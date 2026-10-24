"use client";
import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {CalendarDays,Clock,ChevronLeft,ChevronRight,X} from 'lucide-react';
import './date-time-picker.css';
type Props={value:string;onChange:(value:string)=>void;label:string;mode?:'date'|'time'|'datetime';required?:boolean;disabled?:boolean;max?:string;editable?:boolean};
const pad=(n:number)=>String(n).padStart(2,'0');
const dayKey=(d:Date)=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
function display(value:string,mode:Props['mode']) {
 if(!value)return '';
 if(mode==='time')return value.slice(0,5);
 const [date,time]=value.split('T');
 return date.split('-').reverse().join('/')+(mode==='datetime'&&time?` às ${time.slice(0,5)}`:'');
}
export default function DateTimePicker({value,onChange,label,mode='datetime',required,disabled,max,editable=false}:Props){
 const [open,setOpen]=useState(false);
 const [text,setText]=useState(display(value,mode));
 const [error,setError]=useState('');
 useEffect(()=>{setText(display(value,mode));setError('');},[value,mode]);
 function commit(){
  const raw=text.trim();let next='';let valid=!raw;
  if(raw&&mode==='time'){
   const match=raw.match(/^(\d{1,2}):?(\d{2})$/);
   if(match&&Number(match[1])<24&&Number(match[2])<60){next=`${pad(Number(match[1]))}:${match[2]}`;valid=true;}
  }else if(raw&&mode==='date'){
   const match=raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
   if(match){const [,d,m,y]=match;const date=new Date(Number(y),Number(m)-1,Number(d));next=`${y}-${m}-${d}`;valid=Number(y)>=1000&&dayKey(date)===next;}
  }
  if(valid&&(!max||next<=max)){setError('');setText(display(next,mode));if(next!==value)onChange(next);}
  else{setText(display(value,mode));setError(mode==='time'?'Horário inválido. Use HH:mm.':'Data inválida. Use DD/MM/AAAA.');}
 }
 const icon=mode==='time'?<Clock size={17} aria-hidden/>:<CalendarDays size={17} aria-hidden/>;
 return <span className={`date-time-field${editable?' date-time-editable':''}`}>
  <input aria-label={label} aria-haspopup={editable?undefined:'dialog'} aria-expanded={editable?undefined:open} aria-invalid={!!error} required={required} disabled={disabled}
   value={editable?text:display(value,mode)} placeholder={editable?(mode==='time'?'HH:mm':'DD/MM/AAAA'):mode==='time'?'Selecionar horário':mode==='date'?'Selecionar data':'Selecionar data e horário'}
   inputMode={editable?(mode==='date'?'numeric':'text'):'none'} onChange={e=>{if(editable){const digits=e.target.value.replace(/\D/g,'').slice(0,8);setText(mode==='date'?[digits.slice(0,2),digits.slice(2,4),digits.slice(4,8)].filter(Boolean).join('/'):e.target.value);setError('');}}} onBlur={()=>{if(editable)commit();}}
   onClick={()=>{if(!editable)setOpen(true);}} onInvalid={e=>{if(!editable){e.preventDefault();setOpen(true);}}}
   onKeyDown={e=>{if(editable){if(e.key==='Enter'){e.preventDefault();e.stopPropagation();commit();}return;}if(e.key==='Tab'||e.key==='Escape')return;e.preventDefault();e.stopPropagation();setOpen(true);}} />
  {editable?<button type="button" className="date-time-open" aria-label={`Abrir ${mode==='time'?'horário':'calendário'}: ${label}`} aria-haspopup="dialog" disabled={disabled} onClick={()=>setOpen(true)}>{icon}</button>:icon}
  {error&&<small role="alert">{error} Valor anterior mantido.</small>}
  {open&&!disabled&&createPortal(<PickerDialog {...{value,onChange,label,mode,required,max}} onClose={()=>setOpen(false)}/>,document.body)}
 </span>;
}

function PickerDialog({value,onChange,label,mode,required,max,onClose}:Props&{onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null);
 const today=dayKey(new Date());
 const [date,setDate]=useState(mode==='time'?'':value.split('T')[0]);
 const initialTime=mode==='time'?value:value.split('T')[1]||'';
 const [hour,setHour]=useState(initialTime.slice(0,2));
 const [minute,setMinute]=useState(initialTime.slice(3,5));
 const [month,setMonth]=useState((date||today).slice(0,7));
 useEffect(()=>{dialog.current?.showModal();},[]);
 const [year,monthNumber]=month.split('-').map(Number);
 const start=new Date(year,monthNumber-1,1).getDay();
 const days=new Date(year,monthNumber,0).getDate();
 const timeValid=/^\d{1,2}$/.test(hour)&&/^\d{1,2}$/.test(minute)&&Number(hour)<24&&Number(minute)<60;
 const time=`${hour.padStart(2,'0')}:${minute.padStart(2,'0')}`;
 const result=mode==='date'?date:mode==='time'?time:`${date}T${time}`;
 const valid=(mode==='time'||!!date)&&(mode==='date'||timeValid)&&(!max||result<=max);
 function move(delta:number){setMonth(dayKey(new Date(year,monthNumber-1+delta,1)).slice(0,7));}
 return <dialog ref={dialog} className="date-time-dialog" aria-label={label} onCancel={onClose}>
  <header><h2>{label}</h2><button type="button" aria-label="Fechar calendário" onClick={onClose}><X size={20}/></button></header>
  {mode!=='time'&&<>
   <nav aria-label="Mês do calendário"><button type="button" aria-label="Mês anterior" onClick={()=>move(-1)}><ChevronLeft size={20}/></button><strong>{new Date(year,monthNumber-1,1).toLocaleDateString('pt-BR',{month:'long',year:'numeric'})}</strong><button type="button" aria-label="Próximo mês" onClick={()=>move(1)}><ChevronRight size={20}/></button></nav>
   <div className="date-time-week" aria-hidden>{['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map(d=><span key={d}>{d}</span>)}</div>
   <div className="date-time-days">
    {Array.from({length:start},(_,i)=><span key={`empty-${i}`}/>)}
    {Array.from({length:days},(_,i)=>{const key=`${month}-${pad(i+1)}`;return <button type="button" key={key} aria-label={key.split('-').reverse().join('/')} aria-pressed={date===key} aria-current={key===today?'date':undefined} disabled={!!max&&key>max.slice(0,10)} onClick={()=>setDate(key)}>{i+1}</button>})}
   </div>
   <button type="button" className="date-time-today" disabled={!!max&&today>max.slice(0,10)} onClick={()=>{setDate(today);setMonth(today.slice(0,7));}}>Hoje</button>
  </>}
  {mode!=='date'&&<div className="date-time-clock"><label>Hora<input aria-label="Hora" inputMode="numeric" placeholder="08" maxLength={2} value={hour} onChange={e=>setHour(e.target.value.replace(/\D/g,'').slice(0,2))}/></label><span>:</span><label>Minutos<input aria-label="Minutos" inputMode="numeric" placeholder="00" maxLength={2} value={minute} onChange={e=>setMinute(e.target.value.replace(/\D/g,'').slice(0,2))}/></label></div>}
  {max&&result>max&&<p className="date-time-error">Selecione uma data e horário até {display(max,mode)}.</p>}
  <footer>{!required&&<button type="button" onClick={()=>{onChange('');onClose();}}>Limpar</button>}<button type="button" onClick={onClose}>Cancelar</button><button type="button" className="date-time-confirm" disabled={!valid} onClick={()=>{onChange(result);onClose();}}>Confirmar</button></footer>
 </dialog>;
}
