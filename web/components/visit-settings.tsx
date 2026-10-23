"use client";
import VisitAutomationSettings from "./visit-automation-settings";
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {ArrowLeft,Plus,Save,Trash2} from 'lucide-react';
import SiteHeader from './site-header';
import type {VisitPurpose} from '@/lib/visits/model';
import './field-app.css';
import './sales-visits.css';
import './sales-visits-management.css';
export default function VisitSettings(){
 const [rows,setRows]=useState<VisitPurpose[]>([]),[initial,setInitial]=useState<VisitPurpose[]>([]),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
 const dirty=JSON.stringify(rows)!==JSON.stringify(initial);
 async function load(){const r=await fetch('/api/visits/settings',{cache:'no-store'});const b=await r.json();if(!r.ok)throw Error(b.error);setRows(b.purposes);setInitial(b.purposes)}
 useEffect(()=>{load().catch(e=>setError(e.message)).finally(()=>setLoading(false))},[]);
 function update(i:number,patch:Partial<VisitPurpose>){setRows(current=>current.map((r,j)=>j===i?{...r,...patch}:r));setMessage('')}
 async function save(){setBusy(true);setError('');setMessage('');try{
   const changed=rows.filter(row=>!row.id || JSON.stringify(row)!==JSON.stringify(initial.find(r=>r.id===row.id)));
   const r=await fetch('/api/visits/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({purposes:changed})});const b=await r.json();if(!r.ok)throw Error(b.error);await load();setMessage('Configurações salvas.');
 }catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 return <div className="sales-shell"><SiteHeader active="visitsManagement" moduleId="visitas"/><main className="field-app sales-app sales-management">
 <section className="sales-panel sales-purpose-settings">
 <header className="sales-purpose-heading"><h1>Configurações de Visitas</h1><Link href="/visitas/gestao"><ArrowLeft size={16}/>Voltar</Link></header>
 <VisitAutomationSettings/>
 <div className="sales-purpose-tabs" role="tablist" aria-label="Configurações de Visitas"><button role="tab" id="visit-purpose-tab" aria-selected="true" aria-controls="visit-purpose-panel">Finalidade da Visita</button></div>
 <div id="visit-purpose-panel" role="tabpanel" aria-labelledby="visit-purpose-tab">
 <p className="sales-purpose-help">Configure as finalidades disponíveis no agendamento. Desative uma opção para impedir novos usos, preservando as visitas já registradas.</p>
 {error&&<p role="alert" className="sales-error">{error}</p>}
 {loading?<p role="status">Carregando finalidades…</p>:<>
 <div className="sales-purpose-table-wrap"><table className="sales-management-table"><thead><tr><th>Finalidade da Visita</th><th>Descrição</th><th>Ativa</th><th>Ações</th></tr></thead><tbody>{rows.map((row,i)=><tr key={row.id||'new'}><td><input aria-label={`Finalidade ${i+1}`} maxLength={120} value={row.name} disabled={busy} onChange={e=>update(i,{name:e.target.value})}/></td><td><input aria-label={`Descrição ${i+1}`} maxLength={2000} value={row.description} disabled={busy} onChange={e=>update(i,{description:e.target.value})}/></td><td><input type="checkbox" aria-label={`Ativa ${i+1}`} checked={row.active} disabled={busy} onChange={e=>update(i,{active:e.target.checked})}/></td><td>{row.id ? <button aria-label={`Desativar ${row.name}`} title="Desativar finalidade" disabled={busy||!row.active} onClick={()=>update(i,{active:false})}><Trash2 size={16}/></button> : <button aria-label="Remover nova finalidade" title="Remover nova finalidade" disabled={busy} onClick={()=>setRows(rows.filter((_,j)=>j!==i))}><Trash2 size={16}/></button>}</td></tr>)}</tbody></table></div>
 <div className="sales-purpose-actions"><button className="sales-purpose-add" disabled={busy||rows.some(r=>!r.id)} onClick={()=>{setRows([...rows,{id:'',name:'',description:'',active:true,version:0}]);setMessage('')}}><Plus size={16}/>Adicionar finalidade</button><button aria-label="Salvar configurações" title="Salvar configurações" disabled={busy||!dirty} onClick={save}><Save size={17}/></button></div>
 <footer className="sales-purpose-footer"><p role="status">{busy?'Salvando…':dirty?'Alterações não salvas':message||'Configurações salvas'}</p></footer>
 </>}
 </div></section></main></div>
}
