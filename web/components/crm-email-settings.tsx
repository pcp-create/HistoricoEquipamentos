'use client';
import {useEffect,useRef,useState} from 'react';
import EmailMessageEditor from './email-message-editor';
import ActionNotice from './action-notice';
import {crmApi} from './crm-api';

export default function CrmEmailSettings({initial,onClose,onSaved}:{initial:any;onClose:()=>void;onSaved:(value:any)=>void}){
 const [config,setConfig]=useState(initial),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{ref.current?.showModal();return()=>ref.current?.close();},[]);
 async function save(){setBusy(true);setError('');setMessage('');try{const result=await crmApi('',{action:'save-proposal-email-settings',config});setConfig(result);onSaved(result);setMessage('Configurações salvas.');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <dialog ref={ref} className="crm-dialog crm-proposal-flow-dialog" aria-label="Configurações do CRM" onCancel={e=>{e.preventDefault();onClose();}}><section className="customer-report-email"><h2>Configurações do CRM</h2><h3>Envio de proposta por e-mail</h3><p>Campos disponíveis: {'{proposta}'}, {'{revisao}'}, {'{cliente}'}, {'{equipamento}'}, {'{empresa}'} e {'{responsavel}'}.</p><label>Assunto padrão<input maxLength={300} value={config.subject} onChange={e=>setConfig({...config,subject:e.target.value})}/></label><label>Nome padrão do anexo<input maxLength={220} value={config.filenameTemplate} placeholder="Deixe em branco para usar o nome automático" onChange={e=>setConfig({...config,filenameTemplate:e.target.value})}/></label><small>A extensão .pdf é acrescentada automaticamente.</small><EmailMessageEditor label="Texto padrão do e-mail" initialText={config.body} initialHtml={config.bodyHtml} disabled={busy} onChange={(body,bodyHtml)=>setConfig((c:any)=>({...c,body,bodyHtml}))}/><label>Client ID Google<input value={config.gmailClientId} onChange={e=>setConfig({...config,gmailClientId:e.target.value.trim()})}/></label>{error&&<ActionNotice type="error" onClose={()=>setError('')}>{error}</ActionNotice>}{message&&<ActionNotice type="success" onClose={()=>setMessage('')}>{message}</ActionNotice>}<div className="crm-actions"><button type="button" disabled={busy} onClick={onClose}>Fechar</button><button type="button" className="primary" disabled={busy} onClick={()=>void save()}>Salvar configuração</button></div></section></dialog>;
}
