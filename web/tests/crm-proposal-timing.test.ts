import {test} from 'node:test';
import assert from 'node:assert/strict';
import {elapsedTime, proposalTiming} from '../lib/crm/proposal-timing';

test('proposal clocks show elapsed minutes, hours and days without rounding up', () => {
  const start='2026-11-01T00:00:00Z', time=Date.parse(start);
  assert.equal(elapsedTime(start,time),'Agora');
  assert.equal(elapsedTime(start,time+59*60000),'59 min');
  assert.equal(elapsedTime(start,time+90*60000),'1 h 30 min');
  assert.equal(elapsedTime(start,time+24*3600000),'1 dia');
  assert.equal(elapsedTime(start,time+49*3600000),'2 dias 1 h');
  assert.equal(elapsedTime(start,time-10000),'Agora');
  assert.equal(elapsedTime(undefined,time),'—');
  assert.equal(elapsedTime('invalid',time),'—');
});

test('closed proposals freeze total time while their current stage continues aging', () => {
  const proposal={created_at:'2026-11-01T00:00:00Z',stage_since:'2026-11-03T00:00:00Z',status:'reviewed'};
  const now=Date.parse('2026-11-06T00:00:00Z');
  assert.deepEqual(proposalTiming(proposal,now),{closed:false,total:'5 dias',stage:'3 dias'});
  for(const status of ['won','lost','cancelled']) {
    assert.deepEqual(proposalTiming({...proposal,status},now),{closed:true,total:'2 dias',stage:'3 dias'});
  }
});
