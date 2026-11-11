"use client";
import {useEffect,useRef,useState} from 'react';
import './order-activity.css';
const labels:Record<string,string>={service_order_comment_added:'Comentário registrado na projeção de vendas',comment:'Comentário',authorName:'Autor',task_note:'Histórico de tarefa vinculada à OS',taskId:'Código da tarefa',taskTitle:'Tarefa',title:'Título',checklist_save:'Etapa do relatório salva',checklist_submit:'Etapa do relatório enviada',dispatch:'Operação enviada ao técnico',operation_operation:'Programação da operação alterada',operation_checklist_save:'Etapa do relatório salva',operation_review:'Revisão concluída',operation_finish_full:'Operação enviada para revisão',service_operation_created:'Operação criada na programação',service_operation_removed:'Operação excluída',service_operation_operation:'Programação da operação alterada',service_operation_dispatch:'Operação enviada ao técnico',service_operation_review:'Revisão concluída',service_operation_finish_full:'Operação enviada para revisão',service_operation_complete:'Operação concluída',service_schedule_included:'OS incluída na programação',service_schedule_removed:'OS retirada da programação',service_schedule_restored:'Programação restaurada',service_order_processed:'OS processada no M8',service_order_attachment_added:'Anexo incluído no M8',service_schedule_operation_duration:'Duração programada alterada',service_schedule_review_equipment:'Equipamento alterado na revisão',schedule_released:'OS liberada para a próxima etapa',service_task_list_applied:'Lista de operações aplicada',service_schedule_usage:'Utilização de peças alterada',service_schedule_service_cost:'Custo do serviço alterado',order_creation_requested:'Criação da OS solicitada',order_creation_result:'Resultado da criação no M8',order_edit_requested:'Edição da OS solicitada',order_edit_result:'Resultado da edição no M8',report_reopen:'Relatório devolvido ao técnico',info_read:'Leitura das informações confirmada',materials:'Conferência de peças',report_save:'Relatório salvo',report_send:'Relatório enviado',report_send_partial:'Relatório enviado parcialmente',finish_full:'Participação do técnico encerrada',review_save:'Relatório corrigido na revisão',before:'Antes',after:'Depois',document:'Dados da operação',description:'Descrição',internalNote:'Observação interna',responsible:'Técnico responsável',support:'Equipe de apoio',equipmentId:'Código do equipamento',equipment:'Equipamento',duration:'Duração',date:'Data programada',time:'Horário programado',status:'Status',request:'Dados enviados',notes:'Observações',internalNotes:'Observações internas',state:'Situação do envio',message:'Mensagem',company:'Empresa',order:'OS',operation:'Operação',position:'Número da operação',assignedTo:'Responsável pela tarefa',serviceType:'Tipo de serviço',checklistRun:'Relatório',answers:'Respostas',details:'Detalhes',changes:'Alterações',scheduleId:'Programação',stageId:'Etapa',meterDate:'Data da leitura',reason:'Motivo',ready:'Preparado para envio',sending:'Enviando',partial:'Parcial',uncertain:'Confirmação pendente',rejected:'Recusado',complete:'Confirmado no M8',reviewed:'Revisado',completed:'Concluído',executing:'Em execução',awaiting_review:'Aguardando revisão',pending:'Pendente'};
const label=(key:string)=>labels[key]||labels[key.replace(/^(field_|operation_)/,'')]||key.replace(/_/g,' ');
const privateKey=(key:string)=>/(password|token|secret|authorization|base64|^content$)/i.test(key);
function differences(before:any,after:any,path:string[]=[]):{path:string[];before:any;after:any}[]{
 if(JSON.stringify(before)===JSON.stringify(after))return [];
 if(before&&after&&typeof before==='object'&&typeof after==='object'&&!Array.isArray(before)&&!Array.isArray(after))return [...new Set([...Object.keys(before),...Object.keys(after)])].filter(key=>!privateKey(key)&&!['version','updated_at','updated_by','template'].includes(key)).flatMap(key=>differences(before[key],after[key],[...path,key]));
 return [{path,before,after}];
}
function Value({value}:{value:any}){
 if(value===null||value===undefined)return <span>Não informado</span>;
 if(typeof value!=='object')return <span>{typeof value==='boolean'?(value?'Sim':'Não'):labels[String(value)]||String(value)}</span>;
 if('before' in value&&'after' in value){
  const changes=differences(value.before,value.after);
  return <div>{changes.length?<table><thead><tr><th>Campo</th><th>Antes</th><th>Depois</th></tr></thead><tbody>{changes.map((change,index)=><tr key={index}><th>{change.path.map(label).join(' · ')||'Valor'}</th><td><Value value={change.before}/></td><td><Value value={change.after}/></td></tr>)}</tbody></table>:<p>Sem alteração de valores.</p>}<Value value={Object.fromEntries(Object.entries(value).filter(([key])=>!['before','after'].includes(key)))}/></div>;
 }
 return <dl>{Object.entries(value).filter(([key])=>!privateKey(key)).map(([key,item])=><div key={key}><dt>{Array.isArray(value)?Number(key)+1:label(key)}</dt><dd>{typeof item==='object'&&item!==null?<details><summary>Ver dados</summary><Value value={item}/></details>:<Value value={item}/>}</dd></div>)}</dl>;
}
export default function OrderActivity({company,order}:{company:string;order:string}){
 const [rows,setRows]=useState<any[]|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[more,setMore]=useState(false);
 const page=useRef(0),pending=useRef(false),controller=useRef<AbortController|null>(null);
 useEffect(()=>()=>controller.current?.abort(),[]);
 async function load(reset=false){
  if(pending.current)return;pending.current=true;setBusy(true);setError('');const abort=new AbortController();controller.current=abort;
  try{
   const current=reset?0:page.current;
   const response=await fetch('/api/service-orders/activity?'+new URLSearchParams({company,order,page:String(current)}),{cache:'no-store',signal:abort.signal});
   const data=await response.json();if(!response.ok)throw Error(data.error||'Não foi possível consultar o histórico.');
   setRows(old=>current===0?data.rows:[...(old||[]),...data.rows]);setMore(data.hasMore);page.current=current+1;
  }catch(e){if(!abort.signal.aborted)setError((e as Error).message);}finally{pending.current=false;if(!abort.signal.aborted)setBusy(false);}
 }
 return <details className="order-activity" onToggle={e=>{if(e.currentTarget.open&&rows===null)void load();}}>
  <summary>Histórico de ações e alterações da OS</summary>
  <p>Registros do sistema em ordem do mais recente. Horários de Brasília. Apontamentos de horas não são exibidos. Ações externas ou antigas sem registro no portal não podem ser reconstruídas.</p>
  <button type="button" disabled={busy} onClick={()=>void load(true)}>Atualizar histórico</button>
  {error&&<p role="alert">{error} <button type="button" disabled={busy} onClick={()=>void load()}>Tentar novamente</button></p>}
  {rows?.map(row=><article key={row.id}><strong>{label(row.action)}{row.position?` · Operação ${String(row.position).padStart(2,'0')}`:''}</strong><p><time dateTime={row.at}>{new Date(row.at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})}</time> · <b>{row.author}</b>{row.actor&&row.actor!==row.author&&<small> ({row.actor})</small>}</p><details><summary>Ver detalhes da ação</summary><Value value={row.details}/></details></article>)}
  {rows?.length===0&&!busy&&<p>Nenhuma ação registrada para esta OS.</p>}{busy&&<p role="status">Carregando histórico…</p>}{more&&<button type="button" disabled={busy} onClick={()=>void load()}>Carregar mais registros</button>}
 </details>;
}
