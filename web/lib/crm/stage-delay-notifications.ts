import 'server-only';
import {randomUUID} from 'node:crypto';
import {businessMilliseconds} from './business-time';
import {elapsedTime} from './proposal-timing';
import {database} from '../db';
import {TaskInputError,TaskConflict} from '../tasks/store';
import {crmStageDefinitions,type StageKind} from './stage-limits';
import {opportunityStageSinceSql,proposalStageSinceSql,proposalDisplayStatusSql} from './stage-sql';

/** Recompute current stages on every claim: no stale queue survives a transition or a changed limit. */
export async function claimStageDelays(origin:string,limit:1|20=20) {
 const c=await database().connect();
 try {
  await c.query('BEGIN READ WRITE');
  // Serialize this small queue across concurrent reminder/claim workers.
  if(!(await c.query("SELECT pg_try_advisory_xact_lock(133027) acquired")).rows[0].acquired) {
   await c.query('COMMIT');return [];
  }
  const candidates=(await c.query(`
   WITH records AS (
    SELECT 'opportunity'::text kind,o.id,o.number,o.title,o.customer_name,
     COALESCE(o.commercial->>'stage','prospecting') stage,${opportunityStageSinceSql} stage_since,
     o.created_by recipient,NULL::integer creation_limit_minutes
    FROM crm_opportunities o WHERE o.status='open'
    UNION ALL
    SELECT 'proposal',p.id,p.number,p.title,o.customer_name,
     ${proposalDisplayStatusSql} stage,${proposalStageSinceSql} stage_since,
     CASE WHEN p.status='pending' AND COALESCE(w.state,'creating')='creating' THEN p.created_by
      ELSE COALESCE(NULLIF(t.assigned_to,''),CASE WHEN w.state='in_review' THEN w.reviewer END,
       NULLIF(p.document->'commercial'->>'sellerEmail',''),o.created_by,p.created_by) END recipient,pt.creation_limit_minutes
    FROM crm_proposals p JOIN crm_proposal_types pt ON pt.id=p.type_id JOIN crm_opportunities o ON o.id=p.opportunity_id
    LEFT JOIN crm_proposal_workflows w ON w.proposal_id=p.id LEFT JOIN web_tasks t ON t.id=w.review_task_id
    WHERE p.status IN ('pending','converting') AND o.status='open'
   )
   SELECT r.*,u.phone, (CASE WHEN r.kind='proposal' AND r.stage='creating' THEN r.creation_limit_minutes ELSE (s.limits->>(r.kind||':'||r.stage))::integer END) limit_minutes,
    (now() AT TIME ZONE 'America/Sao_Paulo')::date notice_day
   FROM records r CROSS JOIN crm_stage_limit_settings s JOIN web_user_access u ON lower(u.email)=lower(r.recipient)
   WHERE s.id=1 AND u.enabled AND NULLIF(trim(u.phone),'') IS NOT NULL
    AND r.stage NOT IN ('closed','won','lost','cancelled','not_selected')
    AND (CASE WHEN r.kind='proposal' AND r.stage='creating' THEN r.creation_limit_minutes ELSE (s.limits->>(r.kind||':'||r.stage))::integer END)>0
    AND crm_business_minutes(r.stage_since,now()) > (CASE WHEN r.kind='proposal' AND r.stage='creating' THEN r.creation_limit_minutes ELSE (s.limits->>(r.kind||':'||r.stage))::integer END)
    AND NOT EXISTS(SELECT 1 FROM crm_stage_delay_notifications n
     WHERE n.kind=r.kind AND n.record_id=r.id AND n.stage=r.stage AND n.stage_since=r.stage_since
      AND n.notice_day=(now() AT TIME ZONE 'America/Sao_Paulo')::date)
   ORDER BY r.stage_since,r.kind,r.id LIMIT $1`,[limit])).rows;
  const messages=[];
  for(const r of candidates) {
   const id=randomUUID(),token=randomUUID();
   await c.query(`INSERT INTO crm_stage_delay_notifications(id,kind,record_id,stage,stage_since,notice_day,recipient,lease_token)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[id,r.kind,r.id,r.stage,r.stage_since,r.notice_day,r.recipient,token]);
   const stage=crmStageDefinitions[r.kind as StageKind].find(([key])=>key===r.stage)?.[1]||r.stage;
   const name=r.kind==='proposal'?'Proposta':'Oportunidade',prefix=r.kind==='proposal'?'PROP':'OP';
   const path=r.kind==='proposal'?'/crm/propostas/'+r.id:'/crm?tab=opportunities&opportunity='+r.id;
   const duration=elapsedTime(new Date(0).toISOString(),businessMilliseconds(new Date(r.stage_since).getTime(),Date.now()));
   const allowed=elapsedTime(new Date(0).toISOString(),r.limit_minutes*60000);
   messages.push({id:'crm-delay:'+id,token,number:r.phone,
    text:`⏰ *${name} com etapa em atraso*\n*${prefix}-${r.number} · ${r.title}*\nCliente: ${r.customer_name||'Não informado'}\nEtapa: ${stage}\nTempo útil na etapa: ${duration}\nLimite em dias úteis: ${allowed}\nFaça a tratativa e atualize a etapa. Este aviso será repetido diariamente enquanto o atraso persistir.\n${origin}${path}`});
  }
  await c.query('COMMIT');return messages;
 } catch(e) {await c.query('ROLLBACK');throw e;} finally {c.release();}
}
export async function acknowledgeStageDelay(id:string,token:unknown) {
 if(!/^[0-9a-f-]{36}$/i.test(id)||typeof token!=='string'||!/^[0-9a-f-]{36}$/i.test(token))throw new TaskInputError('Confirmação inválida.');
 const c=await database().connect();
 try {
 await c.query('BEGIN READ WRITE');
 const result=await c.query('UPDATE crm_stage_delay_notifications SET sent_at=COALESCE(sent_at,now()) WHERE id=$1 AND lease_token=$2 RETURNING id',[id,token]);
 if(!result.rows.length)throw new TaskConflict('Aviso não encontrado ou confirmação inválida.');
 await c.query('COMMIT');
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
