"use client";
import EmailMessageEditor from './email-message-editor';
import {defaultCustomerEmail} from '@/lib/service-scheduling/customer-email-template';
export default function ScheduleCustomerEmailSettings({settings,onChange,onSave,busy}:{settings:any;onChange:(value:any)=>void;onSave:(value:any)=>Promise<boolean>;busy:boolean}){
 const config={...defaultCustomerEmail,...settings.customerEmail};
 const change=(key:string,value:string)=>onChange({...settings,customerEmail:{...config,[key]:value}});
 return <section className="customer-report-email customer-email-settings"><h3>Envio do relatório por e-mail</h3><p>Defina o assunto e a mensagem sugeridos para o relatório resumido. O usuário poderá ajustar o texto antes do envio ou da criação do rascunho.</p><p>Campos disponíveis: {'{os}'}, {'{cliente}'}, {'{equipamento}'}, {'{empresa}'} e {'{responsavel}'}.</p><p>{'{equipamento}'} lista uma linha por operação selecionada, no formato · OP01 - Nome do equipamento. Para posicionar os equipamentos distintos separadamente, use {'{equipamento_01}'}, {'{equipamento_02}'}, etc., na ordem das operações selecionadas. Campos sem equipamento correspondente ficam em branco.</p>
  <label>Assunto padrão<input value={config.subject} maxLength={300} onChange={e=>change('subject',e.target.value)}/></label>
  <EmailMessageEditor label="Texto padrão do e-mail" initialText={config.body} initialHtml={config.bodyHtml} disabled={busy} onChange={(body,bodyHtml)=>onChange({...settings,customerEmail:{...config,body,bodyHtml}})}/><small>A formatação salva será aplicada automaticamente à mensagem do relatório.</small>
  <details><summary>Conexão com o Gmail</summary><p>Para criar rascunhos com anexo diretamente na conta do usuário, informe o Client ID público de uma aplicação Google com a API Gmail habilitada e a origem deste portal autorizada. Cada usuário autoriza a conexão na própria conta. Não informe senha ou chave secreta.</p><label>Client ID Google<input value={config.gmailClientId} onChange={e=>change('gmailClientId',e.target.value.trim())} placeholder="….apps.googleusercontent.com"/></label><p>Sem essa configuração, é possível baixar o e-mail com o PDF anexado em formato .eml para abrir em um aplicativo compatível.</p></details>
  <button type="button" disabled={busy||!config.body.trim()||config.body.length>10000||config.bodyHtml.length>100000} onClick={()=>void onSave({...settings,customerEmail:config})}>Salvar configuração de e-mail</button>
 </section>;
}
