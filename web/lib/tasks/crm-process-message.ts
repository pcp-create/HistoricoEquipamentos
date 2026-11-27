import {crmReviewProposalPath} from './crm-review-link';
export function crmProcessMessage(task:{source_key:string;source_status:string;task_id:string;title:string;assignment_reason?:string;assignee_name?:string;customer?:string},origin:string,reviewComment=''){
 const reviewed=task.source_status==='Proposta revisada';
 const separation=task.source_status==='Aguardando separação de peças';
 const heading=reviewed?'Proposta revisada':separation?'Pedido gerado — separação de peças':'Proposta para revisão';
 const description=reviewed||separation?task.assignment_reason:reviewComment;
 const path=crmReviewProposalPath(task.source_key);
 return `📋 *${heading}*\n*TAR-${task.task_id} · ${task.title}*\n${description||''}\nResponsável: ${task.assignee_name||'Não informado'}\nCliente: ${task.customer||'Não informado'}\n\nTarefa: ${origin}/tarefas?task=${task.task_id}${path?`\nProposta: ${origin}${path}`:''}`;
}
