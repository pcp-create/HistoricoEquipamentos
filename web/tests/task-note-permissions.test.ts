import {test} from 'node:test';
import assert from 'node:assert/strict';
import {deleteTaskNote} from '../lib/tasks/store';
import {taskAdministrator} from '../lib/tasks/privacy';

test('only enabled administrators may delete task timeline notes', async () => {
  const g = globalThis as any, previous = g.historyPool;
  try {
    for (const access of [undefined, {role:'user',enabled:true}, {role:'admin',enabled:false}]) {
      const queries:string[] = [];
      const query = async (sql:string) => { queries.push(sql); return {rows:sql.includes('web_user_access') && access ? [access] : []}; };
      g.historyPool = {query,connect:async()=>({query,release(){}})};
      assert.equal(await taskAdministrator('user@example.com'), false);
      await assert.rejects(() => deleteTaskNote({id:'1',noteId:'10'}, {email:'user@example.com'} as any), e => (e as Error).constructor.name === 'Forbidden');
      assert.ok(queries.includes('ROLLBACK'));
      assert.ok(!queries.some(sql=>sql.includes('DELETE FROM web_task_notes')));
    }
    const queries:string[] = [];
    const query = async (sql:string) => { queries.push(sql); return {rows:sql.includes('web_user_access') ? [{role:'admin',enabled:true}] : []}; };
    g.historyPool = {query,connect:async()=>({query,release(){}})};
    assert.equal(await taskAdministrator('admin@example.com'), true);
    await assert.rejects(() => deleteTaskNote({id:'1',noteId:'10'}, {email:'admin@example.com'} as any), /Tarefa não encontrada/);
    assert.ok(queries.some(sql=>sql.includes('FROM web_tasks')));
  } finally { g.historyPool = previous; }
});
