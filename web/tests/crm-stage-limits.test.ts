import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {stageLimit,stageOverdue} from '../lib/crm/stage-limits';
import {validateStageLimits,saveStageLimits,stageLimitSettings} from '../lib/crm/stage-limit-store';
import {claimStageDelays,acknowledgeStageDelay} from '../lib/crm/stage-delay-notifications';

test('limits validate stages and use strict elapsed time, excluding terminal records',()=>{
 assert.deepEqual(validateStageLimits({'proposal:creating':60}),{'proposal:creating':60});
 for(const limits of [null,[],{'proposal:won':10},{'opportunity:lost':1},{'proposal:creating':0},{'proposal:creating':1.5},{'proposal:creating':'60'},{'proposal:creating':Infinity}])assert.throws(()=>validateStageLimits(limits));
 const since='2026-01-01T00:00:00Z',now=Date.parse(since)+3600000;
 assert.equal(stageOverdue({stage_since:since,stage_limit_minutes:60},now),false);
 assert.equal(stageOverdue({stage_since:since,stage_limit_minutes:60},now+1),true);
 assert.equal(stageOverdue({stage_since:since},now+1),false);
 assert.equal(stageOverdue({stage_since:'invalid',stage_limit_minutes:60},now),false);
 assert.equal(stageLimit('opportunity',{status:'open',commercial:{stage:'qualification'}},{'opportunity:qualification':10}),10);
 assert.equal(stageLimit('proposal',{status:'pending',workflow:{state:'in_review'}},{'proposal:in_review':20}),20);
 assert.equal(stageLimit('proposal',{status:'won'},{'proposal:won':20}),null);
 assert.equal(stageLimit('proposal',{status:'pending',opportunity_status:'won',workflow:{state:'in_review'}},{'proposal:in_review':20}),null);
});

test('daily delay queue uses current stage and owner, deduplicates and stops after treatment',async()=>{
 const db=new PGlite(),g=globalThis as any,old=g.historyPool;
 try {
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;
   CREATE TABLE web_user_access(email text primary key,phone text,enabled boolean);
   INSERT INTO web_user_access VALUES('seller','5511999999999',true),('reviewer','5522999999999',true),('other','5533999999999',true);
   CREATE TABLE crm_opportunities(id uuid primary key,number int,title text,customer_name text,status text,commercial jsonb,created_by text,created_at timestamptz,updated_at timestamptz);
   CREATE TABLE crm_proposals(id uuid primary key,opportunity_id uuid,number int,title text,status text,document jsonb,created_by text,created_at timestamptz,updated_at timestamptz);
   CREATE TABLE crm_proposal_workflows(proposal_id uuid,state text,reviewer text,review_task_id bigint,updated_at timestamptz);
   CREATE TABLE web_tasks(id bigint,assigned_to text);
   CREATE TABLE crm_order_links(proposal_id uuid,state text,updated_at timestamptz);
   CREATE TABLE crm_events(opportunity_id uuid,proposal_id uuid,action text,details jsonb,created_at timestamptz);
  `);
  await db.exec(readFileSync(new URL('../sql/133_crm_stage_limits.sql',import.meta.url),'utf8'));
  const query=db.query.bind(db);g.historyPool={query,connect:async()=>({query,release(){}})};
  const op=randomUUID(),p=randomUUID();
  await db.query("INSERT INTO crm_opportunities VALUES($1,1,'Oportunidade teste','Cliente','open','{}','seller',now()-interval '2 hours',now())",[op]);
  await db.query("INSERT INTO crm_proposals VALUES($1,$2,1,'Proposta teste','pending','{}','seller',now()-interval '2 hours',now())",[p,op]);
  await db.query("INSERT INTO crm_proposal_workflows VALUES($1,'in_review','reviewer',1,now()-interval '90 minutes')",[p]);
  await db.exec("INSERT INTO web_tasks VALUES(1,'reviewer')");
  assert.deepEqual(await claimStageDelays('https://example.test'),[]);
  const config=await saveStageLimits({version:1,limits:{'proposal:in_review':60,'opportunity:prospecting':60}},'admin');
  assert.equal(config.version,2);
  await assert.rejects(saveStageLimits({version:1,limits:{}},'admin'),/Outra pessoa/);
  const first=await claimStageDelays('https://example.test');
  assert.equal(first.length,2);
  assert.equal(first.find(n=>n.text.includes('PROP-1'))?.number,'5522999999999');
  assert.equal(first.find(n=>n.text.includes('OP-1'))?.number,'5511999999999');
  await acknowledgeStageDelay(first[0].id.slice(10),first[0].token);
  await acknowledgeStageDelay(first[0].id.slice(10),first[0].token);
  await assert.rejects(acknowledgeStageDelay(first[0].id.slice(10),randomUUID()));
  assert.deepEqual(await claimStageDelays('https://example.test'),[]);
  await db.exec("UPDATE web_tasks SET assigned_to='other'");
  assert.deepEqual(await claimStageDelays('https://example.test'),[]);
  // A subsequent local calendar day gets one fresh notice for the current assignee.
  await db.exec("UPDATE crm_stage_delay_notifications SET notice_day=notice_day-1");
  const next=await claimStageDelays('https://example.test');
  assert.equal(next.length,2);assert.equal(next.find(n=>n.text.includes('PROP-1'))?.number,'5533999999999');
  await db.exec("DELETE FROM crm_stage_delay_notifications; UPDATE crm_proposal_workflows SET state='sent',updated_at=now(); UPDATE crm_opportunities SET status='lost'");
  assert.deepEqual(await claimStageDelays('https://example.test'),[]);
  await db.exec("UPDATE crm_opportunities SET status='open';UPDATE web_user_access SET enabled=false WHERE email='seller'");
  assert.deepEqual(await claimStageDelays('https://example.test'),[]);
  await db.exec("UPDATE web_user_access SET enabled=true WHERE email='seller'");
  await saveStageLimits({version:(await stageLimitSettings()).version,limits:{}},'admin');
  assert.deepEqual(await claimStageDelays('https://example.test'),[]);
 } finally {g.historyPool=old;await db.close();}
});
