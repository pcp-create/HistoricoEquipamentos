const opportunityAuditStage=(side:string)=>`CASE WHEN COALESCE(e.details->'${side}'->>'status','open')='open'
 THEN COALESCE(e.details->'${side}'->'commercial'->>'stage','prospecting') ELSE e.details->'${side}'->>'status' END`;
export const opportunityStageSinceSql=`COALESCE(
 CASE WHEN o.status='won' THEN (SELECT min(e.created_at) FROM crm_events e WHERE e.opportunity_id=o.id AND e.action='proposal_converted') END,
 (SELECT max(e.created_at) FROM crm_events e WHERE e.opportunity_id=o.id AND e.action='opportunity_updated'
 AND (${opportunityAuditStage('before')}) IS DISTINCT FROM (${opportunityAuditStage('after')})),o.created_at)`;
export const proposalDisplayStatusSql=`CASE
 WHEN p.status='pending' AND EXISTS(SELECT 1 FROM crm_proposals winner WHERE winner.opportunity_id=p.opportunity_id AND winner.id<>p.id AND winner.status='won') THEN 'not_selected'
 WHEN p.status='pending' AND EXISTS(SELECT 1 FROM crm_opportunities parent WHERE parent.id=p.opportunity_id AND parent.status='lost') THEN 'lost'
 WHEN p.status='pending' THEN COALESCE(w.state,'creating') ELSE p.status END`;
export const proposalStageSinceSql=`CASE
 WHEN p.status='pending' AND (${proposalDisplayStatusSql})='not_selected' THEN COALESCE(
 (SELECT min(e.created_at) FROM crm_events e JOIN crm_proposals winner ON winner.id=e.proposal_id WHERE winner.opportunity_id=p.opportunity_id AND winner.status='won' AND e.action='proposal_converted'),
 (SELECT min(winner.updated_at) FROM crm_proposals winner WHERE winner.opportunity_id=p.opportunity_id AND winner.status='won'))
 WHEN p.status='pending' AND (${proposalDisplayStatusSql})='lost' THEN (SELECT parent.updated_at FROM crm_opportunities parent WHERE parent.id=p.opportunity_id)
 WHEN p.status='pending' THEN GREATEST(COALESCE(w.updated_at,p.created_at),(SELECT max(l.updated_at) FROM crm_order_links l WHERE l.proposal_id=p.id AND l.state='validation_failed'))
 ELSE COALESCE((SELECT max(e.created_at) FROM crm_events e WHERE e.proposal_id=p.id AND e.action=CASE p.status
 WHEN 'converting' THEN 'conversion_requested' WHEN 'won' THEN 'proposal_converted' WHEN 'cancelled' THEN 'cancel_proposal' END),p.updated_at) END`;
