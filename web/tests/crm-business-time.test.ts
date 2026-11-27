import {test} from 'node:test';
import assert from 'node:assert/strict';
import {businessMilliseconds} from '../lib/crm/business-time';
import {stageOverdue} from '../lib/crm/stage-limits';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
test('business deadline skips weekends in São Paulo and matches SQL',async()=>{
 const db=new PGlite();
 try {
  await db.exec(readFileSync(new URL('../sql/135_crm_business_time.sql',import.meta.url),'utf8'));
  const examples=[
   ['2026-11-27T10:00:00-03:00','2026-12-01T10:00:00-03:00',2880],
   ['2026-11-28T10:00:00-03:00','2026-11-30T10:00:00-03:00',600],
   ['2026-11-27T23:30:00-03:00','2026-11-30T00:30:00-03:00',60],
   ['2026-11-30T10:00:00-03:00','2026-11-30T09:00:00-03:00',0],
   ['2026-12-25T00:00:00-03:00','2026-12-26T00:00:00-03:00',1440],
  ] as const;
  for(const [start,end,minutes] of examples) {
   assert.equal(businessMilliseconds(Date.parse(start),Date.parse(end))/60000,minutes);
   assert.equal(Number((await db.query<any>('SELECT crm_business_minutes($1,$2) n',[start,end])).rows[0].n),minutes);
  }
  const row={stage_since:examples[0][0],stage_limit_minutes:2880};
  assert.equal(stageOverdue(row,Date.parse(examples[0][1])),false);
  assert.equal(stageOverdue(row,Date.parse(examples[0][1])+1),true);
 }finally{await db.close();}
});
