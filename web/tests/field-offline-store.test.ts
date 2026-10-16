import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { fieldAction } from "../lib/service-scheduling/field-store";
import { saveChecklistPhoto } from "../lib/service-scheduling/checklist-photos";
import sharp from "sharp";
import { offlineTime } from "../lib/service-scheduling/offline-action";
test("offline timestamps reject invalid, future and expired dates", () => {
  const now = Date.now();
  for (const v of [
    null,
    "invalid",
    new Date(now + 600000).toISOString(),
    new Date(now - 31 * 86400000).toISOString(),
  ])
    assert.throws(() => offlineTime(v, now));
  assert.equal(
    offlineTime(new Date(now - 86400000).toISOString(), now),
    new Date(now - 86400000).toISOString(),
  );
});
test("server replays original offline times, deduplicates retries and rejects newer versions", async () => {
  const db = new PGlite(),
    g = globalThis as any,
    old = g.historyPool;
  g.historyPool = {
    query: db.query.bind(db),
    connect: async () => ({ query: db.query.bind(db), release() {} }),
  };
  try {
    await db.exec("CREATE ROLE anon; CREATE ROLE authenticated;");
    for (const name of [
      "008_administration",
      "009_employees",
      "028_service_scheduling",
      "029_order_links",
      "030_service_schedule_visibility",
      "031_schedule_item_sources",
      "037_field_operations",
      "039_material_withdrawals",
    ])
      await db.exec(
        readFileSync(
          new URL("../sql/" + name + ".sql", import.meta.url),
          "utf8",
        ),
      );
    await db.exec(
      'INSERT INTO web_user_access(email,display_name,role,updated_by) VALUES(\'tech\',\'Técnico\',\'user\',\'test\'); UPDATE web_service_schedule_settings SET document=document||\'{"pauseReasons":[{"id":"gate","name":"Portaria","minutes":15}]}\'::jsonb',
    );
    const s = (
      await db.query<any>(
        "INSERT INTO web_service_schedules(company_id,order_id,created_by) VALUES(1,100,'test') RETURNING id",
      )
    ).rows[0].id;
    const op = randomUUID();
    await db.query(
      "INSERT INTO web_service_operations(id,schedule_id,position,status,document,sent_at,updated_by) VALUES($1,$2,1,'awaiting_execution',$3,now(),'test')",
      [op, s, JSON.stringify({ responsible: "tech", support: [] })],
    );
    await db.query(
      "INSERT INTO web_field_material_checks(operation_id,actor) VALUES($1,'tech')",
      [op],
    );
    const base = (
      await db.query<any>(
        "SELECT version FROM web_service_operations WHERE id=$1",
        [op],
      )
    ).rows[0].version;
    const start = Date.now() - 86400000;
    let previous: string | undefined;
    const action = async (name: string, minutes: number, extra: any = {}) => {
      const at = new Date(start + minutes * 60000).toISOString(),
        id = randomUUID();
      const body = {
        operationId: op,
        requestId: id,
        action: name,
        location: { latitude: -27, longitude: -49, accuracy: 12, at },
        offline: {
          owner: "tech",
          capturedAt: at,
          baseVersion: base,
          previousRequestId: previous,
        },
        ...extra,
      };
      await fieldAction(body, "tech");
      previous = id;
      return body;
    };
    await action("info_read", 0);
    const work = await action("start_work", 1);
    await db.exec(
      "CREATE TABLE web_service_checklist_photos(id bigserial PRIMARY KEY,operation_id uuid,stage_id text,field_id text,filename text,mime text,content bytea,created_by text);",
    );
    await db.exec(
      readFileSync(
        new URL("../sql/051_offline_photo_requests.sql", import.meta.url),
        "utf8",
      ),
    );
    await db.query(
      "UPDATE web_service_operations SET document=document||$2::jsonb WHERE id=$1",
      [
        op,
        JSON.stringify({
          checklistRun: {
            template: {
              stages: [
                {
                  id: "s",
                  name: "Fotos",
                  fields: [{ id: "photo", label: "Foto", type: "photo" }],
                },
              ],
            },
            stages: { s: { status: "released", answers: {} } },
          },
        }),
      ],
    );
    const bytes = await sharp({
      create: { width: 2, height: 2, channels: 3, background: "#ffffff" },
    })
      .png()
      .toBuffer();
    const file = new File([new Uint8Array(bytes)], "test.png", {
        type: "image/png",
      }),
      photoRequest = randomUUID();
    const photo = await saveChecklistPhoto(
      op,
      "s",
      "photo",
      file,
      "tech",
      photoRequest,
    );
    const photoRetry = await saveChecklistPhoto(
      op,
      "s",
      "photo",
      file,
      "tech",
      photoRequest,
    );
    assert.equal(photo.id, photoRetry.id);
    assert.equal(
      (
        await db.query<any>(
          "SELECT count(*)::int n FROM web_service_checklist_photos",
        )
      ).rows[0].n,
      1,
    );
    await action("pause", 11, { sessionId: work.requestId, reasonId: "gate" });
    await action("resume", 36, { sessionId: work.requestId });
    const stop = await action("stop", 46, { sessionId: work.requestId });
    await fieldAction(stop, "tech");
    const session = (
      await db.query<any>("SELECT * FROM web_field_sessions WHERE id=$1", [
        work.requestId,
      ])
    ).rows[0];
    assert.equal(Number(session.active_seconds), 20 * 60);
    assert.equal(Number(session.pause_seconds), 25 * 60);
    assert.equal(
      new Date(session.started_at).toISOString(),
      new Date(start + 60000).toISOString(),
    );
    assert.equal(
      new Date(session.finished_at).toISOString(),
      new Date(start + 46 * 60000).toISOString(),
    );
    assert.equal(
      (await db.query<any>("SELECT count(*)::int n FROM web_field_events"))
        .rows[0].n,
      5,
    );
    const mirrored = (
      await db.query<any>(
        "SELECT hours,created_at FROM web_service_operation_events WHERE action='work_log'",
      )
    ).rows[0];
    assert.equal(Number(mirrored.hours), 0.333);
    assert.equal(
      new Date(mirrored.created_at).toISOString(),
      session.finished_at.toISOString(),
    );
    await db.query(
      "UPDATE web_service_operations SET version=version+1 WHERE id=$1",
      [op],
    );
    await assert.rejects(action("start_work", 47), /Conflito/);
    assert.equal(
      (await db.query<any>("SELECT count(*)::int n FROM web_field_sessions"))
        .rows[0].n,
      1,
    );
  } finally {
    g.historyPool = old;
    await db.close();
  }
});
