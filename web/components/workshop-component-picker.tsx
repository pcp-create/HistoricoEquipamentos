'use client';
import {useId,useState} from 'react';
import {Plus,Pencil,Trash2} from 'lucide-react';
export default function WorkshopComponentPicker({types,admin,onChanged}:{types:any[];admin:boolean;onChanged:()=>Promise<void>}){
 const [selected,setSelected]=useState(''),[name,setName]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[adding,setAdding]=useState(false);
 const selectId=useId(),createId=useId();
 const current=types.find(t=>t.id===selected);
 async function change(action:string,newName?:string){
  setBusy(true);setError('');
  try{const r=await fetch('/api/workshop',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,name:newName,componentId:current?.id,version:current?.version})});const b=await r.json();if(!r.ok)throw Error(b.error);await onChanged();if(action==='component_add'){setSelected(String(b.component.id));setName('');setAdding(false);}if(action==='component_delete')setSelected('');}
  catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 return <section className="ws-component-picker" aria-label="Componente da máquina">
 <label htmlFor={selectId}>Componente *</label>
 <div className="ws-select-add-row"><select id={selectId} name="componentId" required value={selected} disabled={busy} onChange={e=>setSelected(e.target.value)}><option value="">Selecione o componente</option>{types.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select><button className="ws-add-icon" type="button" aria-label="Adicionar componente" title="Adicionar componente" aria-expanded={adding} aria-controls={createId} disabled={busy} onClick={()=>{setAdding(value=>!value);setError('');}}><Plus size={18} aria-hidden="true"/></button></div>
 {adding&&<div id={createId} className="ws-component-create"><input autoFocus aria-label="Nome do novo componente" maxLength={160} value={name} disabled={busy} onChange={e=>setName(e.target.value)} placeholder="Nome do componente" onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();if(!busy&&name.trim())void change('component_add',name);}if(e.key==='Escape'){e.preventDefault();e.stopPropagation();setAdding(false);}}}/><button type="button" disabled={busy||!name.trim()} onClick={()=>void change('component_add',name)}>Cadastrar componente</button><button type="button" disabled={busy} onClick={()=>{setAdding(false);setName('');}}>Cancelar</button></div>}
 {admin&&current&&<div className="ws-component-admin"><button type="button" disabled={busy} onClick={()=>{const value=window.prompt('Alterar nome do componente. Entradas anteriores manterão o nome registrado.',current.name);if(value!==null)void change('component_update',value);}}><Pencil size={14}/>Alterar nome</button><button type="button" disabled={busy} onClick={()=>{if(window.confirm('Excluir este nome da lista? O histórico das entradas será preservado.'))void change('component_delete');}}><Trash2 size={14}/>Excluir da lista</button></div>}
 {error&&<p role="alert" className="ws-error">{error}</p>}
 </section>;
}
