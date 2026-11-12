'use client';
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import NewServiceOrder from './new-service-order';
import {crmApi,crmStatus,crmDate,crmMoney} from './crm-api';
import './crm.css';
export default function CrmProposal({id}:{id:string}){
 const [data,setData]=useState<any>(null),[catalog,setCatalog]=useState<any>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[dirty,setDirty]=useState(false),[title,setTitle]=useState(''),[status,setStatus]=useState('pending'),[orderType,setOrderType]=useState('');
 const sending=useRef(false);
 async function load(){const [p,c]=await Promise.all([crmApi('?proposal='+id),crmApi('?catalogs=1')]);setData(p);setCatalog(c);setTitle(p.title);setStatus(p.status);setOrderType(p.document.type||'');setDirty(false);}
 useEffect(()=>{void load().catch(e=>setError(e.message));},[id]);
 async function convert(link?:any,retry=false){
 if(sending.current)return;
 if(!link&&!window.confirm(data.status==='won'?'Gerar outra OS vinculada a esta proposta?':'Concretizar a proposta e criar a OS no M8 com os dados salvos?'))return;
 if(retry&&!window.confirm('Confira a OS no M8. Confirma que a etapa pendente não foi gravada? Somente a etapa pendente e as seguintes serão reenviadas. Uma etapa já gravada poderá ser duplicada.'))return;
 sending.current=true;setBusy(true);setError('');
 try {
 let result=await crmApi('',link?{action:retry?'retry':'advance',id:link.id,confirmed:retry,updatedAt:link.submission_updated_at}:{action:'convert',id:crypto.randomUUID(),proposalId:id,version:data.version,additional:data.status==='won',orderType});
 // Only explicit ready states advance. An uncertain result always needs human ERP verification.
 while(result.state==='ready')result=await crmApi('',{action:'advance',id:result.linkId});
 if(result.state!=='complete')setError(result.message||'A criação da OS está pendente. Consulte o andamento abaixo.');
 }catch(e){setError((e as Error).message);}finally{try{await load();}catch(e){setError((e as Error).message);}sending.current=false;setBusy(false);}
 }
 if(!data||!catalog)return <main className="main"><Link href="/crm">Voltar ao CRM</Link>{error?<p role="alert">{error}</p>:<p>Carregando proposta…</p>}</main>;
 const type=catalog.proposalTypes.find((t:any)=>String(t.id)===String(data.type_id)),changed=dirty||title!==data.title||status!==data.status;
 const locked=['converting','won'].includes(data.status),pending=data.links.some((l:any)=>!['complete','validation_failed'].includes(l.state));
 const tools=<section className="crm-proposal-tools" aria-label="Situação da proposta">
 <p><Link href={'/crm?opportunity='+data.opportunity_id}>OP-{data.opportunity_number} · {data.customer_name}</Link> · {type?.code} · {type?.name}</p>
 <div className="crm-form-grid"><label>Título da proposta<input maxLength={200} value={title} disabled={busy||locked} onChange={e=>setTitle(e.target.value)}/></label><label>Status da proposta<select value={status} disabled={busy||locked} onChange={e=>setStatus(e.target.value)}>{(locked?[data.status]:['pending','lost','cancelled']).map(s=><option key={s} value={s}>{crmStatus(s)}</option>)}</select></label></div>
 <p>Tipo de oportunidade: <strong>{catalog.opportunityTypes.find((t:any)=>String(t.id)===String(data.opportunity_type_id))?.name}</strong></p>
 <p>{type?.notes}</p><p>Total da proposta: <strong>{crmMoney(data.total_cents)}</strong></p>
 {!type?.order_types?.length&&<p className="crm-info">Este tipo de proposta ainda não tem um ID de tipo de OS configurado. <Link href="/configuracoes/cadastros/crm">Definir nos cadastros</Link>.</p>}
 {error&&<p role="alert" className="crm-error">{error}</p>}
 <label>Tipo de OS a gerar<select aria-label="Tipo de OS a gerar" disabled={busy||pending} value={orderType} onChange={e=>setOrderType(e.target.value)}><option value="">Selecione o tipo de OS</option>{catalog.orderTypes.filter((t:any)=>t.active&&type?.order_types?.includes(String(t.id))).map((t:any)=><option key={t.id} value={t.id}>{t.id} · {t.name}</option>)}</select></label>
 <div className="crm-actions"><button type="button" className="button primary" disabled={busy||changed||pending||!['pending','won'].includes(data.status)||!orderType} title={changed?'Salve a proposta antes de concretizar.':undefined} onClick={()=>void convert()}>{busy?'Processando…':data.status==='won'?'Gerar outra OS':'Concretizar e gerar OS'}</button><button className="button" type="button" disabled={busy} onClick={()=>{if(!changed||window.confirm('Descartar as alterações não salvas e recarregar?'))void load().catch(e=>setError(e.message));}}>Atualizar andamento</button></div>
 {changed&&<p>Salve a proposta antes de concretizar ou gerar uma OS.</p>}
 {!!data.links.length&&<div className="crm-links"><h3>Ordens de serviço e envios vinculados</h3>{data.links.map((l:any)=><article key={l.id}><span className={'crm-status crm-status-'+l.state}>{crmStatus(l.state)}</span>{l.order_id&&<> · <Link href={`/historico?createdCompany=${l.company_id}&createdOrder=${l.order_id}`}>OS-{l.order_id}</Link></>}<p>{crmDate(l.created_at)} · {l.actor}</p>{l.message&&<p>{l.message}</p>}{['preparing','ready','partial','sending'].includes(l.state)&&<button className="button" type="button" disabled={busy} onClick={()=>void convert(l)}>Consultar / continuar envio</button>}{['uncertain','rejected'].includes(l.state)&&<button className="button" type="button" disabled={busy} onClick={()=>void convert(l,true)}>Conferi no M8 — tentar etapa novamente</button>}</article>)}</div>}
 </section>;
 return <NewServiceOrder key={data.version} returnTo="/crm" proposal={{title:'Proposta comercial PROP-'+data.number,draft:data.document,names:data.names,orderTypes:type?.order_types||[],locked:locked||busy,tools,onDirty:setDirty,onSave:async(draft,names)=>{
 await crmApi('',{action:'save-proposal',id,version:data.version,title,status,draft,names});await load();
 }}}/>;
}
