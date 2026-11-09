"use client";
import {useEffect,useState} from 'react';
import {Mail,Download} from 'lucide-react';
import {gmailDraftError} from "@/lib/service-scheduling/gmail-draft-error";
import {companyName} from '@/lib/company-names';
import {defaultCustomerEmail,fillCustomerEmail} from '@/lib/service-scheduling/customer-email-template';
export default function CustomerReportEmail({data,onClose}:{data:any;onClose:()=>void}){
 const order=data.detail?.order||{},config={...defaultCustomerEmail,...data.settings?.document?.customerEmail};
 const values={os:String(order.numero_sequencia||data.schedule.order_id),cliente:order.cliente_nome||order.cliente_razao_social||'',equipamento:order.equipamento||'',empresa:companyName(data.schedule.company_id),responsavel:data.users?.find((u:any)=>u.email===data.email)?.display_name||data.email||''};
 const [to,setTo]=useState(order.cliente_email||order.payload?.clienteEmail||''),[subject,setSubject]=useState(()=>fillCustomerEmail(config.subject,values)),[body,setBody]=useState(()=>fillCustomerEmail(config.body,values));
 const [gmailHelp,setGmailHelp]=useState(false);
 const [busy,setBusy]=useState(false),[ready,setReady]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[gmailUrl,setGmailUrl]=useState('');
 useEffect(()=>{
  if(!config.gmailClientId)return;
  if((window as any).google?.accounts?.oauth2){setReady(true);return;}
  let script=document.getElementById('rj-google-identity') as HTMLScriptElement|null;
  const loaded=()=>setReady(true),failed=()=>setError('Não foi possível conectar ao Google. Você pode baixar o e-mail com o anexo.');
  if(!script){script=document.createElement('script');script.id='rj-google-identity';script.src='https://accounts.google.com/gsi/client';script.async=true;document.head.appendChild(script);}
  script.addEventListener('load',loaded);script.addEventListener('error',failed);
  return()=>{script.removeEventListener('load',loaded);script.removeEventListener('error',failed);};
 },[config.gmailClientId]);
 async function prepare(){
  const response=await fetch('/api/service-scheduling/customer-email',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({scheduleId:String(data.schedule.id),to,subject,body})});
  const result=await response.json();if(!response.ok)throw Error(result.error||'Não foi possível preparar o e-mail.');return result;
 }
 function valid(){return !!(to.trim()&&subject.trim()&&body.trim());}
 async function download(){
  if(busy||!valid())return;setBusy(true);setError('');setMessage('');setGmailHelp(false);
  try{const result=await prepare(),encoded=result.raw.replace(/-/g,'+').replace(/_/g,'/');const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));
   const url=URL.createObjectURL(new Blob([bytes],{type:'message/rfc822'})),link=document.createElement('a');link.href=url;link.download=result.filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
   setMessage('E-mail baixado com o PDF anexado. Abra o arquivo no seu aplicativo de e-mail e confira antes de enviar.');
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 function gmail(){
  if(busy||!ready||!valid())return;setBusy(true);setError('');setMessage('');setGmailHelp(false);setGmailUrl('');
  try{const client=(window as any).google.accounts.oauth2.initTokenClient({client_id:config.gmailClientId,scope:'openid email https://www.googleapis.com/auth/gmail.compose',
   error_callback:()=>{setBusy(false);setError('A conexão com o Google foi cancelada ou bloqueada. Tente novamente.');},
   callback:async(token:any)=>{
    if(token.error||!token.access_token){setBusy(false);setError('O Google não autorizou a criação do rascunho.');return;}
    try{
     const result=await prepare();
     const response=await fetch('https://gmail.googleapis.com/gmail/v1/users/me/drafts',{method:'POST',headers:{Authorization:'Bearer '+token.access_token,'Content-Type':'application/json'},body:JSON.stringify({message:{raw:result.raw}})});
     const responseBody=await response.json().catch(()=>null);
     if(!response.ok){const failure=gmailDraftError(response.status,responseBody);setGmailHelp(failure.enableApi);throw Error(failure.message);}

     const profile:{email?:string}=await fetch('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:'Bearer '+token.access_token}}).then(r=>r.ok?r.json():{}).catch(()=>({}));
     const gmail=new URL('https://mail.google.com/mail/');if(profile.email)gmail.searchParams.set('authuser',profile.email);gmail.hash='drafts';const url=gmail.toString();setGmailUrl(url);setMessage('Rascunho criado no Gmail com o relatório resumido em anexo. Confira o destinatário e o texto antes de enviar.');
     window.open(url,'_blank','noopener,noreferrer');
    }catch(e){setError((e as Error).message);}finally{token.access_token='';setBusy(false);}
   }});
  client.requestAccessToken();}catch{setBusy(false);setError('Não foi possível iniciar a conexão Google. Confira a configuração ou baixe o e-mail com o anexo.');}
 }
 return <form className="customer-report-email" onSubmit={e=>{e.preventDefault();void download();}}>
  <h3>Enviar relatório por e-mail</h3>
  <label>Destinatário<input type="email" required maxLength={254} value={to} disabled={busy} onChange={e=>setTo(e.target.value)}/></label>
  <label>Assunto<input required maxLength={300} value={subject} disabled={busy} onChange={e=>setSubject(e.target.value)}/></label>
  <label>Mensagem<textarea aria-label="Mensagem" required rows={9} maxLength={10000} value={body} disabled={busy} onChange={e=>setBody(e.target.value)}/></label>
  <p>O relatório resumido revisado será anexado ao rascunho. Confira o e-mail e faça o envio no seu aplicativo.</p>
  {!config.gmailClientId&&<small>Para criar o rascunho diretamente no Gmail, configure a conexão Google em Configurações → Envio por e-mail.</small>}
  {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
  {gmailHelp&&<a href={'https://console.cloud.google.com/apis/library/gmail.googleapis.com?project='+encodeURIComponent(config.gmailClientId.split('-')[0])} target="_blank" rel="noopener noreferrer">Abrir Gmail API no Google Cloud para ativar</a>}
  {gmailUrl&&<a href={gmailUrl} target="_blank" rel="noreferrer">Abrir rascunhos no Gmail</a>}
  <div className="scheduling-actions">{config.gmailClientId&&<button type="button" disabled={busy||!ready||!valid()} onClick={gmail}><Mail size={16}/>{busy?'Preparando…':'Criar rascunho no Gmail'}</button>}<button type="submit" disabled={busy||!valid()}><Download size={16}/>{busy?'Preparando…':'Baixar e-mail com anexo'}</button><button type="button" disabled={busy} onClick={onClose}>Fechar</button></div>
 </form>;
}
