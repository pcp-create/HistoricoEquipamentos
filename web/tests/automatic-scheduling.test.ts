import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { validateAutomaticRules } from '../lib/service-scheduling/automatic-rules';

test('automatic rules apply only to first imports and preserve historical/manual schedules', async () => {
 const db = new PGlite();
 try {
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
  const migrate = async (name: string) => db.exec(readFileSync(new URL('../sql/' + name + '.sql', import.meta.url), 'utf8'));
  for (const name of ['008_administration', '009_employees', '028_service_scheduling', '030_service_schedule_visibility']) await migrate(name);
  await db.exec(`CREATE TABLE m8_ordens_servico(company_id integer,id_m8 bigint,tipo_nome text,situacao_nome text,tipo_atendimento_nome text,status_lancamento_nome text,PRIMARY KEY(company_id,id_m8));
   INSERT INTO m8_ordens_servico VALUES(1,1,'A','CRM','Interno','LIBERADO'),(1,2,'B','Outro','Externo',null);
   INSERT INTO web_service_schedules(company_id,order_id,created_by) VALUES(1,1,'manual');`);
  for (const name of ['032_automatic_scheduling','033_automatic_scheduling_status','034_automatic_scheduling_future_only']) await migrate(name);
  const config = validateAutomaticRules({enabled:true,rules:[
   {id:'a',name:'Regra 1',conditions:[{field:'situacao_nome',operator:'eq',value:'CRM'},{field:'tipo_atendimento_nome',operator:'eq',value:'Interno',connector:'and'}]},
   {id:'b',name:'Regra 2',conditions:[{field:'status_lancamento_nome',operator:'eq',value:'LIBERADO'}]},
  ]});
  const save = async (value: any) => db.query("UPDATE web_service_schedule_settings SET document=jsonb_set(document,'{automaticEntry}',$1::jsonb) WHERE id=1",[JSON.stringify(value)]);
  const schedules = async () => (await db.query('SELECT * FROM web_service_schedules ORDER BY id')).rows;
  const before = await schedules();
  await save(config);
  assert.deepEqual(await schedules(),before,'saving rules must preserve existing schedules');
  await db.exec("UPDATE m8_ordens_servico SET status_lancamento_nome='LIBERADO' WHERE id_m8=2");
  assert.deepEqual(await schedules(),before,'updates of old orders must not include them');
  await db.exec(`INSERT INTO m8_ordens_servico VALUES
   (1,3,'C','CRM','Interno',null),
   (1,4,'D','Outro','Externo','LIBERADO'),
   (1,5,'E','CRM','Externo',null);`);
  assert.equal((await schedules()).length,3,'AND conditions and alternative rules evaluated on insert');
  assert.equal((await db.query('SELECT * FROM web_service_operations')).rows.length,2);
  const history = await schedules();
  const changed = validateAutomaticRules({enabled:true,rules:[{id:'c',name:'Novo status',conditions:[{field:'status_lancamento_nome',operator:'neq',value:'LIBERADO'}]}]});
  await save(changed);
  assert.deepEqual(await schedules(),history,'rule changes neither remove nor backfill orders');
  await db.exec("UPDATE web_service_schedules SET active=false WHERE order_id=3");
  await db.exec("INSERT INTO m8_ordens_servico VALUES(1,3,'C','CRM','Interno','FATURADO') ON CONFLICT(company_id,id_m8) DO UPDATE SET status_lancamento_nome=excluded.status_lancamento_nome");
  assert.equal((await db.query<any>('SELECT active FROM web_service_schedules WHERE order_id=3')).rows[0].active,false);
  await db.exec("INSERT INTO m8_ordens_servico VALUES(1,6,'F','Outro','Externo','PENDENTE')");
  assert.equal((await schedules()).length,4,'new imports use changed rules');
  await save({...changed,enabled:false});
  await db.exec("INSERT INTO m8_ordens_servico VALUES(1,7,'F','Outro','Externo','PENDENTE')");
  assert.equal((await schedules()).length,4,'disabled rules do not include new imports');
  for (const [value,expected] of [['PENDENTE',true],['LIBERADO',false],[null,false]]) {
   assert.equal((await db.query<any>('SELECT web_schedule_rule_matches($1::jsonb,$2::jsonb) match',[JSON.stringify({status_lancamento_nome:value}),JSON.stringify(changed)])).rows[0].match,expected);
  }
  assert.throws(()=>validateAutomaticRules({enabled:true,rules:[{id:'x',name:'x',conditions:[{field:'payload',operator:'eq',value:'x'}]}]}),/Preencha/);
 } finally { await db.close(); }
});
