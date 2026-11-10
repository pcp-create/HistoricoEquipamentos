import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import {
  incomingEvent,
  dueDate,
  phoneKey,
  legacyDemandCommand,
} from "../lib/dsu/protocol";
import { processMessage, type Reply } from "../lib/dsu/assistant";

test("DSU: protocolo filtra mensagens próprias, grupos, instância errada e histórico; interpreta listas e botões", () => {
  const body = {
    instance: "BotDemandas",
    event: "messages.upsert",
    data: {
      key: {
        id: "m1",
        fromMe: false,
        remoteJid: "5547999999999@s.whatsapp.net",
      },
      messageTimestamp: Date.now() / 1000,
      message: { conversation: "Oi" },
    },
  };
  assert.equal(incomingEvent(body, "BotDemandas")?.text, "Oi");
  assert.equal(incomingEvent({...body, data:{...body.data,pushName:"Maria\n*Silva*\u202e"}}, "BotDemandas")?.senderName, "Maria Silva");
  assert.equal(incomingEvent({...body, data:{...body.data,pushName:{name:"invalido"}}}, "BotDemandas")?.senderName, undefined);
  assert.equal(incomingEvent(body, "Outro"), null);
  assert.equal(
    incomingEvent(
      {
        ...body,
        data: { ...body.data, key: { ...body.data.key, fromMe: true } },
      },
      "BotDemandas",
    ),
    null,
  );
  assert.equal(
    incomingEvent(
      {
        ...body,
        data: {
          ...body.data,
          key: {
            ...body.data.key,
            remoteJid: "123@g.us",
            remoteJidAlt: body.data.key.remoteJid,
          },
        },
      },
      "BotDemandas",
    ),
    null,
  );
  assert.equal(
    incomingEvent(
      { ...body, data: { ...body.data, messageTimestamp: 1 } },
      "BotDemandas",
    ),
    null,
  );
  for (const message of [
    {
      listResponseMessage: { singleSelectReply: { selectedRowId: "dsu:1:0" } },
    },
    { buttonsResponseMessage: { selectedButtonId: "dsu:1:0" } },
    {
      interactiveResponseMessage: {
        nativeFlowResponseMessage: { paramsJson: '{"id":"dsu:1:0"}' },
      },
    },
  ])
    assert.equal(
      incomingEvent({ ...body, data: { ...body.data, message } }, "BotDemandas")
        ?.text,
      "dsu:1:0",
    );
  assert.equal(phoneKey("(47) 99999-9999"), phoneKey("554799999999"));
  assert.equal(dueDate("31/02/2026"), null);
  assert.equal(dueDate("15/10/2026"), "2026-10-15");
  assert.equal(
    dueDate("amanhã", new Date("2026-10-09T01:00:00Z")),
    "2026-10-09",
  );
});

test("DSU: conversa persistente, criação/conclusão atômicas, deduplicação, privacidade e permissões", async () => {
  const db = new PGlite(),
    g = globalThis as any,
    old = g.historyPool;
  try {
    await db.exec("CREATE ROLE anon; CREATE ROLE authenticated;");
    for (const f of [
      "008_administration.sql",
      "009_employees.sql",
      "010_tasks.sql",
      "018_task_assignment_reason.sql",
      "011_task_kanban.sql",
      "012_manual_tasks.sql",
      "016_task_order_links.sql",
      "015_task_origin_rules.sql",
      "013_task_territories.sql",
      "041_task_completion_notifications.sql",
      "042_restricted_tasks.sql",
      "024_task_stages.sql",
      "027_task_stage_assignment.sql",
      "017_task_reminders.sql",
      "023_task_reminder_recurrence.sql",
      "044_task_followers.sql",
      "045_dsu_assistant.sql",
    ])
      await db.exec(
        readFileSync(new URL("../sql/" + f, import.meta.url), "utf8"),
      );
    let failSession = false;
    const q = async (sql: string, params?: any[]) => {
      if (failSession && sql.startsWith("INSERT INTO web_dsu_sessions"))
        throw new Error("Simulated failure before commit");
      return db.query(sql, params);
    };
    g.historyPool = {
      query: q,
      connect: async () => ({ query: q, release() {} }),
    };
    await db.query(
      "INSERT INTO web_user_access(email,display_name,phone,updated_by) VALUES('ana@example.com','Ana','5547999999999','test'),('bia@example.com','Bia','5547888888888','test')",
    );
    let seq = 0;
    const send = async (
      text: string,
      phone = "5547999999999",
      id = `m${++seq}`,
      legacy = false,
    ) =>
      (
        await processMessage(
          { text, phone, id, instance: "BotDemandas" },
          legacy,
        )
      ).replies[0];
    const choose = (reply: Reply, title: string): string => {
      assert.equal(reply.endpoint, "sendText");
      const line = String(reply.body.text).split("\n").map(line => line.replace(/^\*|\*$/g, "")).find(line => /^\d+ — /.test(line) && line.slice(line.indexOf(" — ") + 3) === title);
      return line?.split(" — ")[0] as string;
    };
    const legacyEvent = {
      text: "concluir DM-25",
      phone: "5547999999999",
      id: "legacy-1",
      instance: "BotDemandas",
    };
    assert.deepEqual(await processMessage(legacyEvent, true), {
      replies: [],
      route: "legacy",
    });
    assert.deepEqual(await processMessage(legacyEvent, true), {
      replies: [],
      duplicate: true,
    });
    assert.equal(await send("Oi"), undefined);
    assert.equal(await send("1"), undefined);
    await send("Menu");
    assert.match(String((await send("Cancelar")).body.text), /encerrado/);
    assert.equal(await send("Oi"), undefined);
    let r = await send("MENU");
    assert.equal(r.endpoint, "sendText");
    assert.equal(r.menu?.buttonText, "Escolha uma opção");
    assert.equal(r.menu?.rows[0].title, "Tarefas");
    assert.equal(await send("Oi novamente"), undefined);
    assert.equal(await send("qualquer palavra"), undefined);
    const oldMenu = r.menu!.rows[0].rowId;
    r = await send(oldMenu);
    assert.equal(await send("bom dia"), undefined);
    r = await send(choose(r, "Criar tarefa"));
    r = await send("Retornar cliente");
    assert.equal(r.endpoint, "sendText");
    r = await send(choose(r, "Para mim"));
    r = await send(
      "Conferir peças do compressor com @Bia",
      undefined,
      undefined,
      true,
    );
    r = await send("31/02/2026");
    assert.match(String(r.body.text), /Data inválida/);
    r = await send("15/10/2026");
    assert.match(String(r.body.text), /restrita/);
    r = await send(choose(r, "Não, tarefa normal"));
    r = await send(choose(r, "Sim, agendar alerta"));
    r = await send("31/02/2099 10:00");
    assert.match(String(r.body.text), /inválida/);
    r = await send("15/10/2099 10:30");
    assert.equal(r.endpoint, "sendText");
    assert.equal((await db.query("SELECT * FROM web_tasks")).rows.length, 0);
    const confirm = choose(r, "Confirmar");
    failSession = true;
    await assert.rejects(
      send(confirm, "5547999999999", "confirm-create"),
      /Simulated failure/,
    );
    assert.equal((await db.query("SELECT * FROM web_tasks")).rows.length, 0);
    assert.equal(
      (await db.query("SELECT * FROM web_task_notifications")).rows.length,
      0,
    );
    assert.equal((await db.query("SELECT * FROM web_task_reminders")).rows.length, 0);
    failSession = false;
    r = await send(confirm, "5547999999999", "confirm-create");
    assert.match(String(r.body.text), /criada/);
    assert.deepEqual(
      await processMessage({
        text: confirm,
        phone: "5547999999999",
        id: "confirm-create",
        instance: "BotDemandas",
      }),
      { replies: [], duplicate: true },
    );
    const task: any = (await db.query("SELECT * FROM web_tasks")).rows[0];
    const alerts = (await db.query("SELECT * FROM web_task_reminders")).rows as any[];
    assert.equal(alerts.length, 1);
    assert.equal(new Date(alerts[0].scheduled_at).toISOString(), "2099-10-15T13:30:00.000Z");
    assert.equal(alerts[0].recipient, "ana@example.com");
    r = await send("Menu", "5547888888888");
    r = await send(choose(r, "Tarefas"), "5547888888888");
    r = await send(choose(r, "Criar alerta"), "5547888888888");
    r = await send(`TAR-${task.id}`, "5547888888888");
    assert.match(String(r.body.text), /sem permissão/);
    r = await send("Menu");
    r = await send(choose(r, "Tarefas"));
    r = await send(choose(r, "Criar alerta"));
    r = await send(`TAR-${task.id}`);
    r = await send("15/10/2099 11:30");
    const schedule = choose(r, "Agendar alerta");
    r = await send(schedule, undefined, "schedule-alert");
    assert.match(String(r.body.text), /agendado/);
    await send(schedule, undefined, "schedule-alert");
    assert.equal((await db.query("SELECT * FROM web_task_reminders")).rows.length, 2);
    assert.equal(task.restricted, false);
    assert.equal(task.created_by, "ana@example.com");
    assert.equal(task.assigned_to, "ana@example.com");
    assert.equal(
      (await db.query("SELECT * FROM web_task_notifications")).rows.length,
      1,
    );
    assert.equal((await db.query("SELECT * FROM web_tasks")).rows.length, 1);
    r = await send("dsu:expired:0");
    assert.match(String(r.body.text), /expirou/);
    await send("menu", "5547888888888");
    r = await send(`Concluir TAR-${task.id}`, "5547888888888");
    assert.match(String(r.body.text), /sem permissão/);
    r = await send("Menu");
    r = await send(choose(r, "Tarefas"));
    r = await send(choose(r, "Minhas tarefas"));
    assert.equal(r.endpoint, "sendText");
    r = await send(choose(r, `TAR-${task.id}`));
    assert.match(String(r.body.text), /Conferir peças/);
    await db.query("UPDATE web_tasks SET restricted=true WHERE id=$1", [
      task.id,
    ]);
    r = await send(`Concluir ${task.id}`);
    assert.match(String(r.body.text), /restrita/);
    assert.doesNotMatch(String(r.body.text), /Retornar cliente/);
    await db.query("UPDATE web_tasks SET restricted=false WHERE id=$1", [
      task.id,
    ]);
    r = await send(`Concluir ${task.id}`);
    await db.query("UPDATE web_tasks SET version=version+1 WHERE id=$1", [
      task.id,
    ]);
    r = await send(choose(r, "Confirmar"));
    assert.match(String(r.body.text), /atualizada/);
    assert.equal(
      (
        await db.query<{ status: string }>(
          "SELECT status FROM web_tasks WHERE id=$1",
          [task.id],
        )
      ).rows[0].status,
      "not_started",
    );
    await send("Menu");
    r = await send(`Concluir ${task.id}`);
    const completion = choose(r, "Confirmar");
    r = await send(completion, "5547999999999", "confirm-done");
    assert.match(String(r.body.text), /concluída/);
    assert.equal(
      (
        await db.query<{ status: string }>(
          "SELECT status FROM web_tasks WHERE id=$1",
          [task.id],
        )
      ).rows[0].status,
      "completed",
    );
    assert.equal(
      (
        await db.query(
          "SELECT * FROM web_task_notifications WHERE kind='completed'",
        )
      ).rows.length,
      1,
    );
    await send(completion, "5547999999999", "confirm-done");
    assert.equal(
      (
        await db.query(
          "SELECT * FROM web_task_notifications WHERE kind='completed'",
        )
      ).rows.length,
      1,
    );
    const external = "5547777777777";
    const initialClient = await processMessage({text:"Oi",phone:external,id:"external-start",instance:"BotDemandas",senderName:"Maria Silva"});
    assert.equal(initialClient.replies.length, 1);
    r = initialClient.replies[0];
    assert.deepEqual(r.menu?.rows.map(row => row.title), ["Comercial", "Assistência Técnica", "Financeiro", "RH"]);
    assert.doesNotMatch(String(r.body.text), /Tarefas|Ana|Bia/);
    assert.equal((await db.query<{actor_email: string | null}>("SELECT actor_email FROM web_dsu_sessions WHERE phone=$1", [phoneKey(external)])).rows[0].actor_email, null);
    for (const [index, [sector, phone]] of [
      ["Comercial", "5547999410228"],
      ["Assistência Técnica", "554735212910"],
      ["Financeiro", "5547992113869"],
      ["RH", "5547996182708"],
    ].entries()) {
      await send("Menu", external);
      const selectionEvent = {text:String(index+1),phone:external,id:`external-sector-${index}`,instance:"BotDemandas"};
      const selectedSector = await processMessage(selectionEvent);
      assert.equal(selectedSector.replies.length, 2);
      r = selectedSector.replies[0];
      assert.ok(String(r.body.text).includes(sector));
      assert.ok(String(r.body.text).includes(`https://wa.me/${phone}`));
      assert.doesNotMatch(String(r.body.text), /encaminhad|transferid/);
      const notice = selectedSector.replies[1];
      assert.equal(notice.endpoint, "sendText");
      assert.equal(notice.body.number, phone);
      assert.ok(String(notice.body.text).includes(sector));
      assert.match(String(notice.body.text), /Maria Silva/);
      assert.ok(String(notice.body.text).includes(`https://wa.me/${external}`));
      assert.deepEqual(await processMessage(selectionEvent), {replies:[], duplicate:true});
      const repeatedChoice = await processMessage({...selectionEvent,id:`external-repeat-${index}`});
      assert.equal(repeatedChoice.replies.length, 1);
    }
    r = await send("listar @ana", external, "external-legacy", true);
    assert.match(String(r.body.text), /Comercial/);
    assert.deepEqual(await processMessage({text:"listar @ana",phone:external,id:"external-legacy",instance:"BotDemandas"},true),{replies:[],duplicate:true});
    r = await send("999", external);
    assert.equal(r.menu?.rows.length, 4);
    const externalChoice = r.menu!.rows[0].rowId;
    await send("Menu", external);
    r = await send(externalChoice, external);
    assert.match(String(r.body.text), /expirou/);
    r = await send("Concluir TAR-1", external);
    assert.equal(r.menu?.rows.length, 4);
    await db.query("UPDATE web_dsu_sessions SET updated_at=now()-interval '31 minutes' WHERE phone=$1", [phoneKey(external)]);
    r = await send("2", external);
    assert.equal(r.menu?.rows[0].title, "Comercial");
    await send("Cancelar", external);
    r = await send("Boa tarde", external);
    assert.equal(r.menu?.rows.length, 4);
    await db.query(
      "UPDATE web_user_access SET enabled=false WHERE email='ana@example.com'",
    );
    r = await send("Menu");
    assert.equal(r, undefined);
    await db.query(
      "UPDATE web_user_access SET enabled=true WHERE email='ana@example.com'",
    );
    await db.query(
      "UPDATE web_user_access SET phone='5547999999999' WHERE email='bia@example.com'",
    );
    r = await send("Menu");
    assert.equal(r, undefined);
    await db.query("UPDATE web_user_access SET phone='5547888888888' WHERE email='bia@example.com'");
    r = await send("Menu");
    r = await send(choose(r, "Tarefas"));
    r = await send(choose(r, "Criar tarefa"));
    r = await send("Assunto confidencial");
    r = await send(choose(r, "Para mim"));
    r = await send("Descritivo reservado");
    r = await send("15/10/2099");
    r = await send(choose(r, "Sim, tarefa restrita"));
    r = await send(choose(r, "Não, criar sem alerta"));
    assert.match(String(r.body.text), /Restrita: Sim/);
    r = await send(choose(r, "Confirmar"));
    assert.match(String(r.body.text), /criada/);
    const secret = (await db.query("SELECT restricted FROM web_tasks WHERE title='Assunto confidencial'")).rows[0] as any;
    assert.equal(secret.restricted, true);
  } finally {
    g.historyPool = old;
    await db.close();
  }
});

test("DSU identifica comandos antigos sem confundir códigos TAR", () => {
  for (const text of [
    "listar",
    "listar @ana",
    "concluir DM-25",
    "reabrir DM000025",
    "original DM-25",
    "Consultar peças com @ana",
  ])
    assert.equal(legacyDemandCommand({}, text), true);
  for (const text of ["Menu", "concluir TAR-25", "Oi", "dsu:uuid:0"])
    assert.equal(legacyDemandCommand({}, text), false);
  const body = {
    legacyRouting: true,
    instance: "BotDemandas",
    event: "messages.upsert",
    data: {
      key: {
        id: "caption",
        fromMe: false,
        remoteJid: "5547999999999@s.whatsapp.net",
      },
      messageTimestamp: Date.now() / 1000,
      message: {
        ephemeralMessage: {
          message: { imageMessage: { caption: "Conferir peça @ana" } },
        },
      },
    },
  };
  assert.equal(incomingEvent(body, "BotDemandas")?.text, "Conferir peça @ana");
});


test("DSU: adaptador n8n preserva o nome do cliente sem encaminhar a chave Evolution", () => {
  const workflow = JSON.parse(readFileSync(new URL("../../automations/n8n/assistente-rj-dsu.json", import.meta.url), "utf8"));
  const config = workflow.nodes.find((node: any) => node.name === "Configuração");
  const payload = {instance:"BotDemandas",event:"messages.upsert",apikey:"segredo-nao-encaminhar",data:{key:{id:"teste",fromMe:false,remoteJid:"5547777777777@s.whatsapp.net"},pushName:"Maria Silva",messageTimestamp:Date.now()/1000,message:{conversation:"Oi"}}};
  const result = new Function("$input", config.parameters.jsCode)({first:()=>({json:{body:payload}})});
  assert.equal(result.length,1);
  assert.equal(result[0].json.payload.data.pushName,"Maria Silva");
  assert.doesNotMatch(JSON.stringify(result), /segredo-nao-encaminhar/);
  assert.equal(incomingEvent(result[0].json.payload, "BotDemandas")?.senderName, "Maria Silva");
});
