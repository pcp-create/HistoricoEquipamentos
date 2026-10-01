import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {updateTerritorySeller} from '../lib/service-scheduling/territory-map';
test('changing seller preserves assignment, increments version, audits and rejects stale saves', async () => {
  const pg = new PGlite();
  await pg.exec(`CREATE TABLE web_task_territories(id bigint primary key,version int,seller text,assignee text,updated_by text,updated_at timestamptz);
  CREATE TABLE web_access_events(event text,email text,actor text,details jsonb);
  INSERT INTO web_task_territories VALUES(1,1,'A','planner',null,null);`);
  const db:any = {connect:async()=>({query:(sql:string,params:any[])=>pg.query(sql.replace('BEGIN READ WRITE','BEGIN'),params),release:()=>{}})};
  try {
    await updateTerritorySeller({id:'1',version:1,seller:'B'},'admin',db);
    const row:any = (await pg.query('SELECT * FROM web_task_territories')).rows[0];
    assert.equal(row.seller,'B'); assert.equal(row.assignee,'planner'); assert.equal(row.version,2);
    await assert.rejects(updateTerritorySeller({id:'1',version:1,seller:'C'},'admin',db),/outro usuário/);
    assert.equal((await pg.query('SELECT * FROM web_access_events')).rows.length,1);
  } finally { await pg.close(); }
});
