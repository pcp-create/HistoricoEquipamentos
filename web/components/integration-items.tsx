"use client";
import {companyName} from "@/lib/company-names";
import {useEffect,useState} from "react";
import {apiFetch} from "@/lib/client-api-cache";
const tabs=[['orders','Ordens de Serviço'],['equipment','Equipamentos'],['products','Produtos'],['customers','Clientes']];
const date=(value:string|null)=>value?new Date(value).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):'—';
export default function IntegrationItems(){
 const [kind,setKind]=useState('orders'),[page,setPage]=useState(1),[refresh,setRefresh]=useState(0);
 const [search,setSearch]=useState(""),[query,setQuery]=useState("");
 const [data,setData]=useState<any>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false);
 useEffect(()=>{
  const controller=new AbortController();setLoading(true);setError('');setData(null);
  void apiFetch(`/api/admin?integration=${kind}&page=${page}&refresh=${refresh}&q=${encodeURIComponent(query)}`,{signal:controller.signal,cache:'no-store'}).then(async r=>{const result=await r.json();if(!r.ok)throw Error(result.error);if(!controller.signal.aborted)setData(result);}).catch(e=>{if(!controller.signal.aborted)setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return ()=>controller.abort();
 },[kind,page,refresh,query]);
 return <section className="manual-card">
  <h2>Itens integrados e atualizados</h2>
  <nav className="app-section-tabs" aria-label="Tipos de integração">{tabs.map(([key,label])=><button type="button" key={key} aria-pressed={kind===key} onClick={()=>{setKind(key);setPage(1);setSearch("");setQuery("");}}>{label}</button>)}</nav>
  <p className="muted">Última integração de cada item, do mais recente para o mais antigo. Inclui cadastros novos e existentes; a data registra a coleta, mesmo quando não houve alteração no cadastro. Horário de Brasília.</p>
  <form className="integration-search" onSubmit={e=>{e.preventDefault();setQuery(search.trim());setPage(1);setRefresh(n=>n+1);}}>
    <label>Pesquisar na lista<input type="search" value={search} maxLength={200} placeholder="Código, nome, cliente, modelo, série ou documento" onChange={e=>setSearch(e.target.value)} /></label>
    <button type="submit">Pesquisar</button>
    {(search || query) && <button type="button" onClick={()=>{setSearch("");setQuery("");setPage(1);}}>Limpar pesquisa</button>}
  </form>
  {error&&<p role="alert">{error}</p>}
  {loading&&<p role="status">Carregando registros…</p>}
  {data&&<><div className="admin-table"><table><thead><tr><th>Código</th><th>{kind==='orders'?'Cliente':'Nome'}</th><th>Empresa</th><th>Informações</th><th>Última integração / atualização</th></tr></thead><tbody>{data.rows.map((row:any)=><tr key={`${row.company_id}:${row.id}`}><td>{row.code}</td><td>{row.name||'—'}</td><td>{companyName(row.company_id)}</td><td>{row.detail||'—'}</td><td>{date(row.updated_at)}</td></tr>)}{!data.rows.length&&<tr><td colSpan={5}>Nenhum registro encontrado.</td></tr>}</tbody></table></div>
  <div className="task-toolbar"><button type="button" disabled={page===1} onClick={()=>setPage(p=>p-1)}>Anterior</button><span>Página {page}</span><button type="button" disabled={!data.hasNext} onClick={()=>setPage(p=>p+1)}>Próxima</button></div></>}
 </section>;
}
