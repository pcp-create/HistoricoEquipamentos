"use client";
import AutoResizeTextarea from "./auto-resize-textarea";
import {Mic,PenLine,Trash2,Check,X} from "lucide-react";
import {createPortal} from "react-dom";
import "./signature-input.css";
import {useEffect,useRef,useState} from 'react';
let activeRecognition:any=null;
export function DictationText({value,onChange,disabled,label,required=false}: {value:string;onChange:(s:string)=>void;disabled:boolean;label:string;required?:boolean}){
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
 return <div className="checklist-dictation"><AutoResizeTextarea required={required} aria-required={required} aria-invalid={required&&!value.trim()} placeholder={required?"Preenchimento obrigatório":undefined} className={required&&!value.trim()?"alert-comment-empty":undefined} aria-label={label} value={value} maxLength={30000} disabled={disabled} onChange={e=>onChange(e.target.value)}/><button type="button" disabled={disabled||!available} aria-pressed={listening} aria-label={listening?'Parar microfone':'Ditar texto'} title={!available?'Ditado indisponível neste navegador':listening?'Parar microfone':'Ditar texto'} onClick={toggle}><Mic size={20}/></button>{listening&&<small role="status">Ouvindo…</small>}{message&&<small role="status">{message}</small>}</div>;
}
export function SignatureInput({ids,onUpload,onClear,disabled,label}:{ids:string[];onUpload:(file:File)=>Promise<void|boolean>;onClear:()=>void;disabled:boolean;label:string}){
 const canvas=useRef<HTMLCanvasElement>(null),area=useRef<HTMLDivElement>(null),dialog=useRef<HTMLDialogElement>(null),confirmation=useRef<HTMLDialogElement>(null);
 const drawing=useRef(false),hasInk=useRef(false),loadToken=useRef(0);
 const [open,setOpen]=useState(false),[confirm,setConfirm]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState('');
 function blank(){loadToken.current++;const c=canvas.current;if(c){const ctx=c.getContext('2d')!;ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);}hasInk.current=false;drawing.current=false;setError('');}
 useEffect(()=>{
  if(!open)return;
  dialog.current?.showModal();
  const c=canvas.current!,box=area.current!;
  function fit(){
   const rect=box.getBoundingClientRect(),ratio=Math.min(window.devicePixelRatio||1,2);
   const width=Math.max(1,Math.round(rect.width*ratio)),height=Math.max(1,Math.round(rect.height*ratio));
   if(c.width===width&&c.height===height)return;
   const copy=document.createElement('canvas');copy.width=c.width;copy.height=c.height;copy.getContext('2d')!.drawImage(c,0,0);
   c.width=width;c.height=height;const ctx=c.getContext('2d')!;ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);
   if(hasInk.current){const scale=Math.min(width/copy.width,height/copy.height),w=copy.width*scale,h=copy.height*scale;ctx.drawImage(copy,(width-w)/2,(height-h)/2,w,h);}
  }
  hasInk.current=false;fit();blank();
  const observer=new ResizeObserver(fit);observer.observe(box);
  const token=loadToken.current;
  if(ids[0]){const image=new Image();image.onload=()=>{if(token!==loadToken.current)return;const ctx=c.getContext('2d')!,scale=Math.min(c.width/image.width,c.height/image.height),w=image.width*scale,h=image.height*scale;ctx.drawImage(image,(c.width-w)/2,(c.height-h)/2,w,h);hasInk.current=true;};image.onerror=()=>{if(token===loadToken.current)setError('Não foi possível carregar a assinatura. Tente novamente ou desenhe uma nova.');};image.src='/api/service-scheduling/photos/'+ids[0];}
  return()=>{loadToken.current++;drawing.current=false;observer.disconnect();dialog.current?.close();};
 },[open]);
 useEffect(()=>{if(confirm)confirmation.current?.showModal();return()=>confirmation.current?.close();},[confirm]);
 function point(e:React.PointerEvent<HTMLCanvasElement>){const c=e.currentTarget,r=c.getBoundingClientRect();return{x:(e.clientX-r.left)*c.width/r.width,y:(e.clientY-r.top)*c.height/r.height};}
 async function save(){
  if(saving||disabled)return;
  if(!hasInk.current){setError('Desenhe a assinatura antes de salvar.');return;}
  setSaving(true);setError('');
  try{const blob=await new Promise<Blob|null>(resolve=>canvas.current!.toBlob(resolve,'image/png'));if(!blob)throw Error('Não foi possível preparar a assinatura.');
   if(await onUpload(new File([blob],'assinatura.png',{type:'image/png'}))===false)throw Error('Não foi possível salvar a assinatura. Tente novamente.');
   setOpen(false);
  }catch(e){setError((e as Error).message);}finally{setSaving(false);}
 }
 const locked=disabled||saving;
 return <div className="checklist-signature"><button type="button" className="signature-card" disabled={disabled} aria-label={'Abrir assinatura: '+label} onClick={()=>{setError('');setOpen(true);}}>{ids.length?<img src={'/api/service-scheduling/photos/'+ids[0]} alt={label}/>:<PenLine size={28}/>}<span>{ids.length?'Visualizar ou alterar assinatura':'Toque para assinar'}</span></button>
 {open&&createPortal(<dialog ref={dialog} className="signature-screen" aria-label={'Assinatura: '+label} onCancel={e=>{e.preventDefault();e.stopPropagation();if(!locked&&!confirm)setOpen(false);}}>
 <header><div><strong>Assinatura</strong><small>{label}</small></div><button type="button" disabled={locked} aria-label="Cancelar assinatura" onClick={()=>setOpen(false)}><X size={22}/></button></header>
 <p>Assine com o dedo no espaço abaixo.</p><div ref={area} className="signature-drawing-area"><canvas ref={canvas} aria-label={label+' — desenhe com o dedo ou mouse'} onPointerDown={e=>{if(locked)return;e.preventDefault();drawing.current=true;e.currentTarget.setPointerCapture(e.pointerId);const p=point(e),ctx=e.currentTarget.getContext('2d')!;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.strokeStyle='#193449';ctx.lineWidth=2.5*Math.min(window.devicePixelRatio||1,2);ctx.lineCap='round';setError('');}} onPointerMove={e=>{if(!drawing.current||locked)return;const p=point(e),ctx=e.currentTarget.getContext('2d')!;ctx.lineTo(p.x,p.y);ctx.stroke();hasInk.current=true;}} onPointerUp={()=>drawing.current=false} onPointerCancel={()=>drawing.current=false}/></div>
 {error&&<p role="alert">{error}</p>}<footer><button type="button" className="signature-clear" aria-label="Limpar assinatura" disabled={locked} onClick={()=>setConfirm(true)}><Trash2 size={16}/>Limpar</button><button type="button" className="signature-save" aria-label="Salvar assinatura" disabled={locked} onClick={()=>void save()}><Check size={16}/>{saving?'Salvando…':'Salvar'}</button><button type="button" className="signature-cancel" disabled={locked} onClick={()=>setOpen(false)}><X size={16}/>Cancelar</button></footer>
 </dialog>,document.body)}
 {open&&confirm&&createPortal(<dialog ref={confirmation} className="signature-confirm" role="alertdialog" aria-labelledby="signature-clear-title" onCancel={e=>{e.preventDefault();e.stopPropagation();setConfirm(false);}}><h3 id="signature-clear-title">Limpar assinatura?</h3><p>A assinatura será removida deste campo. Esta ação não pode ser desfeita.</p><div><button type="button" autoFocus onClick={()=>setConfirm(false)}>Cancelar</button><button type="button" className="signature-clear-confirm" disabled={locked} onClick={()=>{blank();onClear();setConfirm(false);}}>Confirmar limpeza</button></div></dialog>,document.body)}
 </div>;
}
