/** Lifecycle of a proposal revision. A sent revision is immutable. */
export type ProposalWorkflow = {
  state: 'creating' | 'in_review' | 'reviewed' | 'sent';
  revision: number;
  lastSentRevision: number | null;
};

export type ProposalWorkflowAction = 'request_review' | 'complete_review' | 'send_customer' | 'reopen_proposal';

export const initialProposalWorkflow = (): ProposalWorkflow => ({
  state: 'creating', revision: 0, lastSentRevision: null,
});

export function transitionProposalWorkflow(current: ProposalWorkflow, action: ProposalWorkflowAction): ProposalWorkflow {
  if (!Number.isSafeInteger(current.revision) || current.revision < 0 ||
      (current.lastSentRevision !== null && (!Number.isSafeInteger(current.lastSentRevision) || current.lastSentRevision < 0 || current.lastSentRevision > current.revision))) {
    throw new Error('Histórico de revisões inválido.');
  }
  if (action === 'reopen_proposal' && ['in_review','reviewed','sent'].includes(current.state)) return {...current,state:'creating',revision:current.state==='sent'?current.revision+1:current.revision};
  if (action === 'request_review' && ['creating', 'reviewed', 'sent'].includes(current.state)) {
    return {...current, state: 'in_review', revision: current.state === 'sent' ? current.revision + 1 : current.revision};
  }
  if (action === 'complete_review' && ['creating','in_review'].includes(current.state)) return {...current, state: 'reviewed'};
  if (action === 'send_customer' && current.state === 'reviewed') return {...current, state: 'sent', lastSentRevision: current.revision};
  throw new Error('Ação indisponível na situação atual da proposta.');
}
