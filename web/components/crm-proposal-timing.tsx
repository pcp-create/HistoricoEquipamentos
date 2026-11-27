"use client";
import {useEffect, useState} from 'react';
import {Clock3, Hourglass} from 'lucide-react';
import {proposalTiming, type ProposalTiming} from '../lib/crm/proposal-timing';

export default function CrmProposalTiming({proposal, label = 'Tempo da proposta'}: {proposal: ProposalTiming; label?: string}) {
  const [now, setNow] = useState(NaN);
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  const timing = proposalTiming(proposal, now);
  const date = (value?: string) => value && Number.isFinite(Date.parse(value))
    ? new Date(value).toLocaleString('pt-BR') : 'Data não disponível';
  return <dl className="crm-proposal-timing" aria-label={label}>
    <div aria-label={`${timing.closed ? 'Até encerrar' : 'Em aberto'}: ${timing.total}`} title={`${timing.closed ? 'Até encerrar' : 'Em aberto'} · Criada em ${date(proposal.created_at)}${timing.closed ? ` · Encerrada em ${date(proposal.stage_since)}` : ''}`}>
      <dt><Clock3 size={14} aria-hidden="true"/><span>{timing.closed ? 'Até encerrar' : 'Em aberto'}</span></dt>
      <dd>{timing.total}</dd>
    </div>
    {!['won', 'cancelled'].includes(proposal.status || '') && <div className="crm-proposal-stage-time" aria-label={`Nesta etapa: ${timing.stage}`} title={`Nesta etapa · Entrada na etapa: ${date(proposal.stage_since)}`}>
      <dt><Hourglass size={14} aria-hidden="true"/><span>Nesta etapa</span></dt>
      <dd>{timing.stage}</dd>
    </div>}
  </dl>;
}
