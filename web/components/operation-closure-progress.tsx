import {pendingTechnicianClosures} from '@/lib/service-scheduling/execution-locks';
export default function OperationClosureProgress({operation,users=[]}:{operation:any;users?:any[]}){
 const document=operation.document||{},pending=pendingTechnicianClosures(document);
 if(!document.requireTechnicianClosure||!pending.length)return null;
 const name=(email:string)=>users.find(user=>user.email===email)?.display_name||email;
 const sent=[...new Set<string>([document.responsible,...(document.support||[])].filter(Boolean))].filter(email=>document.technicianClosures?.[email]);
 return <div className="operation-closure-progress" role="status">
  <strong>Envio parcial — em execução</strong>
  {document.checklistRun?.submission?.by&&<small>Relatório enviado por: {name(document.checklistRun.submission.by)}</small>}
  <small>Já encerraram / enviaram: {sent.length?sent.map(name).join(', '):'Nenhum técnico'}</small>
  <small>Pendentes de encerramento / envio: {pending.map(name).join(', ')}</small>
  <small>Revisão aguardando o encerramento de todos os técnicos.</small>
 </div>;
}
