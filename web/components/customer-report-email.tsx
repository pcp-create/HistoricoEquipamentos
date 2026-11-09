"use client";
import {useEffect,useState} from 'react';
import EmailRecipientsField from './email-recipients-field';
import EmailMessageEditor from './email-message-editor';
import {Mail,Download} from 'lucide-react';
import {gmailDraftError} from "@/lib/service-scheduling/gmail-draft-error";
import {emailRecipients,reportAttachmentName} from '@/lib/service-scheduling/email-recipients';
import {canEmailOperation} from '@/lib/service-scheduling/customer-email-operations';
import {operationNumber} from '@/lib/service-scheduling/operation-number';
import {summaryReportFilename} from '@/lib/service-scheduling/report-filename';
import {emailTextHtml} from '@/lib/service-scheduling/email-body-text';
import {companyName} from '@/lib/company-names';
import {customerEmailEquipment,equipmentEmailBodyTemplate} from '@/lib/service-scheduling/customer-email-equipment';
import {defaultCustomerEmail,fillCustomerEmail,fillCustomerEmailHtml} from '@/lib/service-scheduling/customer-email-template';
export default function CustomerReportEmail({data,onClose}:{data:any;onClose:()=>void}){
 const order=data.detail?.order||{},config={...defaultCustomerEmail,...data.settings?.document?.customerEmail};
 const values={os:String(order.numero_sequencia||data.schedule.order_id),cliente:order.cliente_nome||order.cliente_razao_social||'',...customerEmailEquipment(order,(data.operations||[]).filter(canEmailOperation)),empresa:companyName(data.schedule.company_id),responsavel:data.users?.find((u:any)=>u.email===data.email)?.display_name||data.email||''};
 const [to,setTo]=useState(order.cliente_email||order.payload?.clienteEmail||''),[subject,setSubject]=useState(()=>fillCustomerEmail(config.subject,values).replace(/[\r\n]+/g,'; ')),[body,setBody]=useState(()=>fillCustomerEmail(equipmentEmailBodyTemplate(config.body),values));
 const [recipientDraft,setRecipientDraft]=useState('');
 const effectiveTo=[to,recipientDraft.trim()].filter(Boolean).join(', ');
 const htmlTemplate=config.bodyHtml?(config.bodyHtml+(/\{equipamento(?:_\d{2,3})?\}/.test(config.body)?'':emailTextHtml('\n\nEquipamentos atendidos:\n{equipamento}'))):undefined;
 const [bodyHtml,setBodyHtml]=useState<string|undefined>(()=>htmlTemplate?fillCustomerEmailHtml(htmlTemplate,values):undefined);
 const [operations,setOperations]=useState<any[]>(data.operations||[]),[selectedIds,setSelectedIds]=useState<string[]>((data.operations||[]).filter(canEmailOperation).map((op:any)=>op.id)),[filenameEdited,setFilenameEdited]=useState(false);
 const [subjectEdited,setSubjectEdited]=useState(false),[bodyEdited,setBodyEdited]=useState(false),[bodyResetKey,setBodyResetKey]=useState(0),[editedEquipment,setEditedEquipment]=useState('');
 const equipmentValues=customerEmailEquipment(order,operations.filter(op=>selectedIds.includes(op.id)));
 const activeValues={...values,...equipmentValues};
 const suggestedHtml=htmlTemplate?fillCustomerEmailHtml(htmlTemplate,activeValues):undefined;
 const suggestedSubject=fillCustomerEmail(config.subject,activeValues).replace(/[\r\n]+/g,'; '),suggestedBody=fillCustomerEmail(equipmentEmailBodyTemplate(config.body),activeValues),equipmentSignature=JSON.stringify(equipmentValues);
 useEffect(()=>{if(!subjectEdited)setSubject(suggestedSubject);},[suggestedSubject,subjectEdited]);
 useEffect(()=>{if(!bodyEdited){setBody(suggestedBody);setBodyHtml(suggestedHtml);setBodyResetKey(key=>key+1);}},[suggestedBody,suggestedHtml,bodyEdited]);
 const [filename,setFilename]=useState(()=>summaryReportFilename(order,data.operations||[],String(data.schedule.order_id)));
 const [contacts,setContacts]=useState<any[]>([]),[contactsReady,setContactsReady]=useState(false),[contactError,setContactError]=useState(''),[canCreate,setCanCreate]=useState(false),[showContact,setShowContact]=useState(false),[savingContact,setSavingContact]=useState(false);
 const [contact,setContact]=useState({email:'',name:'',job_title:'',phone:''});
 const [confirmSend,setConfirmSend]=useState(false);
 useEffect(()=>{let active=true;fetch('/api/service-scheduling/customer-email/contacts?scheduleId='+encodeURIComponent(data.schedule.id)).then(async r=>{const v=await r.json();if(!r.ok)throw Error(v.error);if(active){setOperations(v.operations||[]);setSelectedIds((v.operations||[]).filter(canEmailOperation).map((op:any)=>op.id));setContacts(v.contacts||[]);setCanCreate(v.canCreate);setTo((current:string)=>current||v.defaultEmail||(v.contacts||[]).find((c:any)=>c.email)?.email||'');if(v.reportFilename)setFilename(v.reportFilename);setContactsReady(true);}}).catch(e=>{if(active)setContactError(e.message||'Não foi possível carregar os contatos.');});return()=>{active=false;};},[data.schedule.id]);
 function chooseOperations(ids:string[]){setSelectedIds(ids);setConfirmSend(false);if(!filenameEdited)setFilename(summaryReportFilename(order,operations.filter(op=>ids.includes(op.id)),String(data.schedule.order_id)));}
 function addRecipient(email:string){try{setTo(emailRecipients([to,email].filter(Boolean).join(', ')).join(', '));}catch(e){setContactError((e as Error).message);}}
 async function saveContact(){setSavingContact(true);setContactError('');try{const r=await fetch('/api/service-scheduling/customer-email/contacts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...contact,scheduleId:String(data.schedule.id)})});const result=await r.json();if(!r.ok)throw Error(result.error);setContacts(result.contacts);addRecipient(result.saved.email);setContact({email:'',name:'',job_title:'',phone:''});setShowContact(false);}catch(e){setContactError((e as Error).message);}finally{setSavingContact(false);}}
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
  const response=await fetch('/api/service-scheduling/customer-email',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({scheduleId:String(data.schedule.id),to:effectiveTo,subject,body,bodyHtml,operationIds:selectedIds,reportFilename:filename})});
  const result=await response.json();if(!response.ok)throw Error(result.error||'Não foi possível preparar o e-mail.');return result;
 }
 function valid(){try{emailRecipients(effectiveTo);reportAttachmentName(filename);return !!(selectedIds.length&&subject.trim()&&body.trim()&&body.length<=10000&&(bodyHtml===undefined||bodyHtml.length<=100000));}catch{return false;}}
 async function download(){
  if(busy||!contactsReady||savingContact||!valid())return;setBusy(true);setError('');setMessage('');setGmailHelp(false);
  try{const result=await prepare(),encoded=result.raw.replace(/-/g,'+').replace(/_/g,'/');const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));
   const url=URL.createObjectURL(new Blob([bytes],{type:'message/rfc822'})),link=document.createElement('a');link.href=url;link.download=result.filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
   setMessage('E-mail baixado com o PDF anexado. Abra o arquivo no seu aplicativo de e-mail e confira antes de enviar.');
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 function gmail(send=false){
  if(busy||!ready||!contactsReady||savingContact||!valid())return;setBusy(true);setError('');setMessage('');setGmailHelp(false);setGmailUrl('');setConfirmSend(false);
  try{const client=(window as any).google.accounts.oauth2.initTokenClient({client_id:config.gmailClientId,scope:'openid email https://www.googleapis.com/auth/gmail.compose',
   error_callback:()=>{setBusy(false);setError('A conexão com o Google foi cancelada ou bloqueada. Tente novamente.');},
   callback:async(token:any)=>{
    if(token.error||!token.access_token){setBusy(false);setError('O Google não autorizou o acesso ao Gmail.');return;}
    try{
     const result=await prepare();
     const response=await fetch('https://gmail.googleapis.com/gmail/v1/users/me/'+(send?'messages/send':'drafts'),{method:'POST',headers:{Authorization:'Bearer '+token.access_token,'Content-Type':'application/json'},body:JSON.stringify(send?{raw:result.raw}:{message:{raw:result.raw}})});
     const responseBody=await response.json().catch(()=>null);
     if(!response.ok){const failure=gmailDraftError(response.status,responseBody);setGmailHelp(failure.enableApi);throw Error(failure.message);}

     if(send){setMessage('E-mail enviado com sucesso com o relatório resumido em anexo.');return;}
     const profile:{email?:string}=await fetch('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:'Bearer '+token.access_token}}).then(r=>r.ok?r.json():{}).catch(()=>({}));
     const gmail=new URL('https://mail.google.com/mail/');if(profile.email)gmail.searchParams.set('authuser',profile.email);gmail.hash='drafts';const url=gmail.toString();setGmailUrl(url);setMessage('Rascunho criado no Gmail com o relatório resumido em anexo. Confira o destinatário e o texto antes de enviar.');
     window.open(url,'_blank','noopener,noreferrer');
    }catch(e){setError((e as Error).message);}finally{token.access_token='';setBusy(false);}
   }});
  client.requestAccessToken();}catch{setBusy(false);setError('Não foi possível iniciar a conexão Google. Confira a configuração ou baixe o e-mail com o anexo.');}
 }
 return <form className="customer-report-email" onSubmit={e=>{e.preventDefault();void download();}}>
  <h3>Enviar relatório por e-mail</h3>
  <fieldset className="email-operation-selection" disabled={busy||!contactsReady}><legend>Operações do relatório</legend>
   <label className="email-operation-choice email-operation-select-all"><input type="checkbox" checked={operations.some(canEmailOperation)&&selectedIds.length===operations.filter(canEmailOperation).length} onChange={e=>chooseOperations(e.target.checked?operations.filter(canEmailOperation).map(op=>op.id):[])}/>Selecionar todas as operações revisadas</label>
   {operations.map(op=><label key={op.id} className="email-operation-choice" data-disabled={!canEmailOperation(op)}><input type="checkbox" disabled={!canEmailOperation(op)} checked={selectedIds.includes(op.id)} onChange={e=>chooseOperations(e.target.checked?[...selectedIds,op.id]:selectedIds.filter(id=>id!==op.id))}/><span>Operação {operationNumber(op.position)} · {op.document?.description||op.document?.serviceType||'Sem descrição'}{!canEmailOperation(op)?' — indisponível: revisão ou relatório pendente':''}</span></label>)}
   {contactsReady&&!selectedIds.length&&<small>Selecione pelo menos uma operação revisada com relatório técnico.</small>}
  </fieldset>
  <EmailRecipientsField value={to} draft={recipientDraft} onChange={value=>{setTo(value);setConfirmSend(false);}} onDraftChange={value=>{setRecipientDraft(value);setConfirmSend(false);}} contacts={contacts} disabled={busy||savingContact||!contactsReady} canCreate={canCreate} onCreate={()=>setShowContact(!showContact)}>
  {showContact&&<fieldset disabled={savingContact||busy}><legend>Contato do cliente</legend>{[['email','E-mail do contato'],['name','Nome do contato'],['job_title','Cargo'],['phone','Telefone']].map(([key,label])=><label key={key}>{label}<input type={key==='email'?'email':'text'} value={(contact as any)[key]} maxLength={key==='phone'?40:key==='email'?254:160} onChange={e=>setContact({...contact,[key]:e.target.value})}/></label>)}<div className="scheduling-actions"><button type="button" onClick={()=>setShowContact(false)}>Cancelar cadastro</button><button type="button" disabled={!contact.name.trim()||!contact.email.trim()} onClick={()=>void saveContact()}>{savingContact?'Salvando…':'Salvar contato'}</button></div></fieldset>}
  {showContact&&contactError&&<p role="alert">{contactError}</p>}
  </EmailRecipientsField>
  {!showContact&&contactError&&<p role="alert">{contactError}</p>}
  <label>Nome do anexo<input aria-label="Nome do anexo" required maxLength={220} value={filename} disabled={busy||!contactsReady} onChange={e=>{setFilename(e.target.value);setFilenameEdited(true);}}/></label>
  <small>Relatório resumido em PDF. Este será o nome do arquivo anexado ao e-mail.</small>
  <label>Assunto<input required maxLength={300} value={subject} disabled={busy} onChange={e=>{setSubject(e.target.value);setSubjectEdited(true);}}/></label>
  {bodyEdited&&editedEquipment!==equipmentSignature&&<p className="email-equipment-update">Os equipamentos selecionados mudaram. Sua mensagem foi preservada. <button type="button" disabled={busy} onClick={()=>setBodyEdited(false)}>Reaplicar texto padrão com os equipamentos atuais</button><small>Substitui as edições e a formatação da mensagem.</small></p>}
  <EmailMessageEditor initialText={body} initialHtml={bodyHtml} resetKey={bodyResetKey} disabled={busy} onChange={(text,html)=>{setBody(text);setBodyHtml(html);setBodyEdited(true);setEditedEquipment(equipmentSignature);}}/>
  <p>Confira os destinatários, o nome do anexo e a mensagem antes de enviar ou criar o rascunho.</p>
  {!config.gmailClientId&&<small>Para criar o rascunho diretamente no Gmail, configure a conexão Google em Configurações → Envio por e-mail.</small>}
  {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
  {gmailHelp&&<a href={'https://console.cloud.google.com/apis/library/gmail.googleapis.com?project='+encodeURIComponent(config.gmailClientId.split('-')[0])} target="_blank" rel="noopener noreferrer">Abrir Gmail API no Google Cloud para ativar</a>}
  {gmailUrl&&<a href={gmailUrl} target="_blank" rel="noreferrer">Abrir rascunhos no Gmail</a>}
  {confirmSend&&<div role="dialog" aria-label="Confirmar envio do relatório"><p>Enviar o relatório para {effectiveTo}?</p><p>Anexo: {filename}</p><p>Operações: {operations.filter(op=>selectedIds.includes(op.id)).map(op=>operationNumber(op.position)).join(', ')}</p><button type="button" disabled={busy} onClick={()=>gmail(true)}>Confirmar envio</button><button type="button" onClick={()=>setConfirmSend(false)}>Cancelar envio</button></div>}
  <div className="scheduling-actions">{config.gmailClientId&&<button type="button" disabled={busy||!ready||!contactsReady||!valid()} onClick={()=>setConfirmSend(true)}><Mail size={16}/>Enviar diretamente pelo Gmail</button>}{config.gmailClientId&&<button type="button" disabled={busy||!ready||!contactsReady||!valid()} onClick={()=>gmail(false)}><Mail size={16}/>{busy?'Preparando…':'Criar rascunho no Gmail'}</button>}<button type="submit" disabled={busy||!contactsReady||!valid()}><Download size={16}/>{busy?'Preparando…':'Baixar e-mail com anexo'}</button><button type="button" disabled={busy} onClick={onClose}>Fechar</button></div>
 </form>;
}
