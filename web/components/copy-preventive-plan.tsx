"use client";
import {useEffect,useRef,useState} from "react";
import {Copy} from "lucide-react";
import {apiFetch} from "@/lib/client-api-cache";
export default function CopyPreventivePlan({disabled,onCopy}:{disabled:boolean;onCopy:(plan:any)=>void}) {
  const [open,setOpen]=useState(false),[q,setQ]=useState(""),[page,setPage]=useState(0);
  const [rows,setRows]=useState<any[]>([]),[more,setMore]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState("");
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{if(open)dialog.current?.showModal();else dialog.current?.close();},[open]);
  useEffect(()=>{
    if(!open)return;
    const abort=new AbortController();setLoading(true);setError("");
    const timer=setTimeout(()=>{void apiFetch('/api/equipment-management/plan-templates?'+new URLSearchParams({q,page:String(page)}),{signal:abort.signal,cache:"reload"}).then(async r=>{
      const b=await r.json();if(!r.ok)throw Error(b.error);if(!abort.signal.aborted){setRows(b.rows);setMore(b.hasMore);}
    }).catch(e=>{if(!abort.signal.aborted)setError(e.message);}).finally(()=>{if(!abort.signal.aborted)setLoading(false);});},250);
    return()=>{clearTimeout(timer);abort.abort();};
  },[open,q,page]);
  return <><button type="button" disabled={disabled} className="catalog-edit-button" onClick={()=>setOpen(true)}><Copy size={15}/> Copiar plano existente</button>
    <dialog ref={dialog} className="copy-preventive-dialog" onCancel={()=>setOpen(false)} aria-label="Copiar plano existente">
      <h2>Copiar plano existente</h2><p>Copie nome, intervalos, observações, produtos e serviços. A última intervenção e a OS de origem não serão copiadas.</p>
      <label>Buscar plano ou equipamento<input type="search" value={q} onChange={e=>{setQ(e.target.value);setPage(0);}} placeholder="Plano, equipamento ou série"/></label>
      {error&&<p role="alert">{error}</p>}{loading?<p role="status">Carregando planos…</p>:<div className="copy-preventive-results">{rows.map(row=><article key={row.id}>
        <div><strong>{row.document.name}</strong><small>{row.equipment_name} · Série {row.serial||"não informada"}</small><small>{row.document.hours ? `${row.document.hours} h` : ""} {row.document.months ? `· ${row.document.months} meses` : ""} · {row.document.items?.length||0} itens</small></div>
        <button type="button" disabled={disabled} onClick={()=>{const d=row.document;onCopy({name:d.name,hours:d.hours,months:d.months,notes:d.notes||"",items:structuredClone(d.items||[]),lastDate:"",lastMeter:"",lastOrder:""});setOpen(false);}}>Usar este plano</button>
      </article>)}{!rows.length&&!error&&<p>Nenhum plano encontrado.</p>}</div>}
      <div className="catalog-editor-actions"><button type="button" disabled={!page||loading} onClick={()=>setPage(page-1)}>Anterior</button><span>Página {page+1}</span><button type="button" disabled={!more||loading} onClick={()=>setPage(page+1)}>Próxima</button><button type="button" onClick={()=>setOpen(false)}>Fechar</button></div>
    </dialog></>;
}
