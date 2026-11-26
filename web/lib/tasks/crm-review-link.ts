/** Retorna o endereço da proposta associada a uma tarefa de revisão do CRM. */
export function crmReviewProposalPath(sourceKey: unknown): string | null {
 if(typeof sourceKey !== 'string') return null;
 const match=/^manual:crm-review:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.exec(sourceKey);
 return match ? `/crm/propostas/${match[1]}` : null;
}
