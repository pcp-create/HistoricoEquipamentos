import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GET as tasks, POST as taskPost } from '../app/api/tasks/automation/route';
import { GET as locations, POST as locationPost } from '../app/api/localities/automation/route';

test('automation credentials and read-only checks', async () => {
 const saved = [process.env.TASK_AUTOMATION_TOKEN, process.env.PREVENTIVE_REPORT_TOKEN];
 const token = 'test-only-task-token-with-at-least-32-characters';
 const fallback = 'test-only-fallback-with-at-least-32-characters';
 const request = (authorization?: string) => new Request('https://example.test', {headers: authorization ? {authorization} : {}});
 try {
  delete process.env.TASK_AUTOMATION_TOKEN; delete process.env.PREVENTIVE_REPORT_TOKEN;
  for (const handler of [tasks, locations, taskPost, locationPost]) {
   const r = await handler(request());
   assert.equal(r.status,503);
   assert.equal((await r.json()).code,'AUTOMATION_TOKEN_NOT_CONFIGURED');
  }
  process.env.TASK_AUTOMATION_TOKEN='short';
  assert.equal((await tasks(request('Bearer short'))).status,503);
  process.env.TASK_AUTOMATION_TOKEN=token; process.env.PREVENTIVE_REPORT_TOKEN=fallback;
  for (const handler of [tasks, locations, taskPost, locationPost]) {
   for (const [value,code] of [
    [undefined,'AUTHORIZATION_MISSING'],
    [token,'AUTHORIZATION_FORMAT'],
    ['Bearer wrong','AUTOMATION_TOKEN_MISMATCH'],
    ['Bearer '+fallback,'AUTOMATION_TOKEN_MISMATCH'],
   ] as const) {
    const r=await handler(request(value));
    assert.equal(r.status,401);
    const body=await r.json();
    assert.equal(body.code,code);
    assert.ok(!JSON.stringify(body).includes(token));
   }
  }
  for (const handler of [tasks,locations]) {
   assert.deepEqual(await (await handler(request('Bearer '+token))).json(),{ok:true,authenticated:true});
   process.env.TASK_AUTOMATION_TOKEN='  '+token+'\n';
   assert.equal((await handler(request('bearer   '+token))).status,200);
   delete process.env.TASK_AUTOMATION_TOKEN;
   assert.equal((await handler(request('Bearer '+fallback))).status,200);
   process.env.TASK_AUTOMATION_TOKEN=token;
  }
 } finally {
  for (const [i,key] of ['TASK_AUTOMATION_TOKEN','PREVENTIVE_REPORT_TOKEN'].entries()) {
   if(saved[i]===undefined)delete process.env[key];else process.env[key]=saved[i];
  }
 }
});
