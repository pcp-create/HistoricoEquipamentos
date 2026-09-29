"use client";
import {Mic} from "lucide-react";
import {useEffect,useRef,useState} from 'react';
let activeRecognition:any=null;
export function DictationText({value,onChange,disabled,label}: {value:string;onChange:(s:string)=>void;disabled:boolean;label:string}){
 const [available,setAvailable]=useState(false),[listening,setListening]=useState(false),[message,setMessage]=useState('');
 const recognition=useRef<any>(null),latest=useRef(value),change=useRef(onChange);
 latest.current=value;change.current=onChange;
 useEffect(()=>{setAvailable(!!((window as any).SpeechRecognition||(window as any).webkitSpeechRecognition));return()=>{if(recognition.current){recognition.current.onresult=null;recognition.current.onerror=null;recognition.current.onend=null;recognition.current.abort();if(activeRecognition===recognition.current)activeRecognition=null;}};},[]);
 useEffect(()=>{if(disabled)recognition.current?.stop();},[disabled]);
 function toggle(){if(listening){recognition.current?.stop();return;}
  setMessage('');activeRecognition?.abort();
  const Constructor=(window as any).SpeechRecognition||(window as any).webkitSpeechRecognition;
  if(!Constructor)return;
  const r=new Constructor();recognition.current=r;activeRecognition=r;r.lang='pt-BR';r.continuous=true;r.interimResults=false;
  r.onresult=(event:any)=>{let text='';for(let i=event.resultIndex;i<event.results.length;i++)if(event.results[i].isFinal)text+=event.results[i][0].transcript+' ';if(text.trim()){const next=[latest.current,text.trim()].filter(Boolean).join(' ').slice(0,30000);latest.current=next;change.current(next);}};
  r.onstart=()=>setListening(true);r.onend=()=>{setListening(false);if(activeRecognition===r)activeRecognition=null;};
  r.onerror=(e:any)=>{setListening(false);setMessage(e.error==='not-allowed'?'Permita o acesso ao microfone no navegador.':e.error==='aborted'?'':'Não foi possível transcrever. Tente novamente ou digite o texto.');};
  try{r.start();}catch{setMessage('Não foi possível iniciar o microfone.');}
 }
 return <div className="checklist-dictation"><textarea aria-label={label} value={value} maxLength={30000} disabled={disabled} onChange={e=>onChange(e.target.value)}/><button type="button" disabled={disabled||!available} aria-pressed={listening} aria-label={listening?'Parar microfone':'Ditar texto'} title={!available?'Ditado indisponível neste navegador':listening?'Parar microfone':'Ditar texto'} onClick={toggle}><Mic size={20}/></button>{listening&&<small role="status">Ouvindo…</small>}{message&&<small role="status">{message}</small>}</div>;
}
export function SignatureInput({ids,onUpload,onClear,disabled,label}:{ids:string[];onUpload:(file:File)=>Promise<void>;onClear:()=>void;disabled:boolean;label:string}){
 const canvas=useRef<HTMLCanvasElement>(null),drawing=useRef(false),hasInk=useRef(false);
 const [error,setError]=useState('');
 useEffect(()=>{if(!ids.length){const c=canvas.current;if(c){const ctx=c.getContext('2d')!;ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);hasInk.current=false;}}},[ids.length]);
 function point(e:React.PointerEvent<HTMLCanvasElement>){const c=e.currentTarget,r=c.getBoundingClientRect();return{x:(e.clientX-r.left)*c.width/r.width,y:(e.clientY-r.top)*c.height/r.height};}
 function clear(){const c=canvas.current;if(c){const ctx=c.getContext('2d')!;ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);hasInk.current=false;}setError('');}
 async function useSignature(){if(!hasInk.current){setError('Desenhe a assinatura antes de confirmar.');return;}const blob=await new Promise<Blob|null>(resolve=>canvas.current!.toBlob(resolve,'image/png'));if(blob)await onUpload(new File([blob],'assinatura.png',{type:'image/png'}));}
 return <div className="checklist-signature">{ids.length?<><img src={'/api/service-scheduling/photos/'+ids[0]} alt={label}/><button type="button" disabled={disabled} onClick={onClear}>Refazer assinatura</button></>:<><canvas width={800} height={240} ref={canvas} aria-label={label+' — desenhe com o dedo ou mouse'} onPointerDown={e=>{if(disabled)return;e.preventDefault();drawing.current=true;e.currentTarget.setPointerCapture(e.pointerId);const p=point(e),ctx=e.currentTarget.getContext('2d')!;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.strokeStyle='#193449';ctx.lineWidth=3;ctx.lineCap='round';setError('');}} onPointerMove={e=>{if(!drawing.current||disabled)return;const p=point(e),ctx=e.currentTarget.getContext('2d')!;ctx.lineTo(p.x,p.y);ctx.stroke();hasInk.current=true;}} onPointerUp={()=>drawing.current=false} onPointerCancel={()=>drawing.current=false}/><div className="checklist-toolbar"><button type="button" disabled={disabled} onClick={clear}>Limpar assinatura</button><button type="button" disabled={disabled} onClick={()=>void useSignature()}>Usar assinatura</button></div></>}{error&&<p role="alert">{error}</p>}</div>;
}
