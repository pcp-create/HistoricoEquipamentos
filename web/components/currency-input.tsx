"use client";
import {useState} from "react";
const format = (value:string) => value !== '' && Number.isFinite(Number(value)) ? Number(value).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}) : value;
export default function CurrencyInput({value,label,onChange}:{value:string;label:string;onChange:(value:string)=>void}) {
  const [editing,setEditing]=useState(false),[text,setText]=useState('');
  return <input aria-label={label} inputMode="decimal" value={editing?text:format(value)}
    onFocus={()=>{setText(format(value));setEditing(true)}}
    onChange={event=>{const raw=event.target.value;setText(raw);onChange(raw.includes(',')?raw.replace(/\./g,'').replace(',','.'):raw)}}
    onBlur={()=>setEditing(false)}/>;
}
