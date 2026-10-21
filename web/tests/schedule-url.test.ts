import {test} from "node:test";
import assert from "node:assert/strict";
import {PGlite} from "@electric-sql/pglite";
import {scheduleUrl} from "../lib/service-scheduling/schedule-url";
import {scheduleIdForNumber} from "../lib/service-scheduling/store";

test("schedule links use the OS number across companies, retaining legacy fallback", () => {
  assert.equal(scheduleUrl({id:635, numero_sequencia:15070, company_id:1}), "/programacao?OS=15070");
  assert.equal(scheduleUrl({id:636, numero_sequencia:15071, company_id:2}), "/programacao?OS=15071");
  assert.equal(scheduleUrl({id:635, numero_sequencia:null, order_id:15070}), "/programacao?OS=15070");
  assert.equal(scheduleUrl({id:635}), "/programacao?id=635");
});
test("OS number resolves the internal schedule without mixing companies or guessing missing orders", async () => {
  const db = new PGlite(), g=globalThis as any, old=g.historyPool;
  g.historyPool={query:db.query.bind(db)};
  try {
    await db.exec("CREATE TABLE web_service_schedules(id bigint,company_id int,order_id bigint); CREATE TABLE m8_ordens_servico(company_id int,id_m8 bigint,numero_sequencia bigint); INSERT INTO web_service_schedules VALUES(635,1,999),(636,2,888),(638,1,15072); INSERT INTO m8_ordens_servico VALUES(1,999,15070),(2,888,15071),(1,15072,NULL)");
    assert.equal(await scheduleIdForNumber("15070"), "635");
    assert.equal(await scheduleIdForNumber("15071"), "636");
    assert.equal(await scheduleIdForNumber("15072"), "638");
    await assert.rejects(scheduleIdForNumber("999"), /não encontrada/);
    await assert.rejects(scheduleIdForNumber("635"), /não encontrada/);
    await assert.rejects(scheduleIdForNumber("invalid"), /inválido/);
    await db.exec("INSERT INTO web_service_schedules VALUES(637,1,999)");
    await assert.rejects(scheduleIdForNumber("15070"), /Mais de uma/);
  } finally {g.historyPool=old;await db.close();}
});
