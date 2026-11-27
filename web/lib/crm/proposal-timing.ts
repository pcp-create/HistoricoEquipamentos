export type ProposalTiming = {created_at?: string; stage_since?: string; status?: string; stage_limit_minutes?:number|null};

export function elapsedTime(start: string | undefined, end: number): string {
  const time = start ? Date.parse(start) : NaN;
  if (!Number.isFinite(time) || !Number.isFinite(end)) return '—';
  const minutes = Math.max(0, Math.floor((end - time) / 60000));
  if (minutes < 1) return 'Agora';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h${minutes % 60 ? ` ${minutes % 60} min` : ''}`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? 'dia' : 'dias'}${hours % 24 ? ` ${hours % 24} h` : ''}`;
}

export function proposalTiming(proposal: ProposalTiming, now: number) {
  const closed = ['won', 'lost', 'cancelled', 'not_selected'].includes(proposal.status || '');
  return {
    closed,
    total: elapsedTime(proposal.created_at, closed ? Date.parse(proposal.stage_since || '') : now),
    stage: elapsedTime(proposal.stage_since, now),
  };
}
