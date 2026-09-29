import { test, expect } from "@playwright/test";
const op = {
  id: "11111111-1111-4111-8111-111111111111",
  position: 1,
  order_number: 123,
  status: "executing",
  version: 1,
  document: {
    description: "Revisão",
    responsible: "tech",
    support: [],
    date: "2026-01-01",
    time: "08:00",
  },
};
const session = {
  id: "22222222-2222-4222-8222-222222222222",
  operation_id: op.id,
  actor: "tech",
  display_name: "Técnico de teste",
  kind: "work",
  state: "finished",
  started_at: "2026-01-01T08:00:00Z",
  finished_at: "2026-01-01T09:00:00Z",
  active_seconds: 3600,
  pause_seconds: 0,
  correction_version: 0,
};
const logs = () => ({
  fieldSessions: [session],
  fieldEvents: [
    {
      action: "start_work",
      latitude: -27.5,
      longitude: -49.2,
      document: { sessionId: session.id },
      created_at: session.started_at,
    },
  ],
  operations: [op],
  events: [],
  requests: [] as any[],
});
test("technician requests edits and manual entries while official hours stay unchanged", async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: "m8-access", value: "test", domain: "localhost", path: "/" },
  ]);
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: -27, longitude: -49 });
  await page.setViewportSize({ width: 390, height: 844 });
  const data = logs();
  data.operations.push({ ...op, id: "other", position: 2 });
  data.fieldSessions.push({ ...session, id: "other-session", operation_id: "other" });
  const bodies: any[] = [];
  await page.route("**/api/activity", (r) =>
    r.fulfill({ json: { admin: true } }),
  );
  await page.route(/\/api\/field(?:\?.*)?$/, (r) =>
    r.fulfill({ json: r.request().url().includes("?")
      ? { operation: op, checked: true, infoRead: true, email: "tech",
          settings: { document: { vehicles: [], pauseReasons: [] } }, history: [] }
      : { rows: [{ ...op, schedule_id: "schedule", number: 123, description: "Revisão" }], displayName: "Técnico", email: "tech" } }),
  );
  await page.route("**/api/field/time-requests", (r) => {
    if (r.request().method() === "POST") {
      const b = r.request().postDataJSON();
      bodies.push(b);
      data.requests.push({
        ...b,
        id: "request-" + bodies.length,
        session_id: b.sessionId,
        operation_id: op.id,
        status: "pending",
        created_at: new Date().toISOString(),
      });
      return r.fulfill({ json: { ok: true } });
    }
    return r.fulfill({ json: data });
  });
  await page.goto("/tecnico");
  await expect(page.getByRole("button", { name: "Meus apontamentos" })).toHaveCount(0);
  await page.getByRole("button", { name: "Programação" }).click();
  await page.getByText("OS 123", { exact: true }).click();
  await page.getByRole("button", { name: /Operação 1/ }).click();
  await page.getByRole("button", { name: "Apontamentos", exact: true }).click();
  await expect(page.getByText("Lat. -27.500000")).toHaveCount(0);
  await expect(page.getByRole("columnheader", { name: "Início", exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Solicitar ajuste", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Fim", { exact: true }).fill("2026-01-01T07:00");
  await dialog
    .getByLabel("Motivo da solicitação / ajuste")
    .fill("Esqueci de encerrar");
  await dialog.getByRole("button", { name: "Solicitar aprovação" }).click();
  await expect(dialog).toHaveCount(0);
  expect(bodies[0].action).toBe("request");
  expect(bodies[0].proposed.finished_at).toBe("2026-01-01T10:00:00.000Z");
  expect(bodies[0].location.latitude).toBe(-27);
  await expect(
    page.getByRole("button", { name: "Aguardando aprovação" }),
  ).toBeDisabled();
  await expect(
    page.locator(".time-log-cards").getByText("01:00:00"),
  ).toHaveCount(2);
  await page
    .getByRole("button", { name: "Incluir apontamento manual" })
    .click();
  await expect(dialog.getByLabel("Operação", { exact: true })).toHaveValue(op.id);
  await dialog.getByLabel("Tipo", { exact: true }).selectOption("travel");
  await dialog.getByLabel("Início", { exact: true }).fill("2026-01-02T07:00");
  await dialog.getByLabel("Fim", { exact: true }).fill("2026-01-02T08:00");
  await dialog
    .getByLabel("Motivo da solicitação / ajuste")
    .fill("Registro manual");
  await dialog.getByRole("button", { name: "Solicitar aprovação" }).click();
  await expect(dialog).toHaveCount(0);
  expect(bodies[1].sessionId).toBeUndefined();
  expect(bodies[1].kind).toBe("travel");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("planner adjusts hours from the scheduling tab", async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: "m8-access", value: "test", domain: "localhost", path: "/" },
  ]);
  const data = {
    ...logs(),
    canEditSettings: true,
    users: [],
    email: "planner",
    schedule: { id: "1", company_id: 1, order_id: "123" },
    settings: {
      document: {
        serviceTypes: [],
        calendars: [],
        vehicles: [],
        checklists: [],
      },
    },
    detail: {
      order: {
        numero_sequencia: 123,
        cliente_nome: "Cliente",
        equipamento: "Compressor",
      },
      materials: [],
      services: [],
    },
    costs: [],
    usage: [],
  };
  await page.route("**/api/activity", (r) =>
    r.fulfill({ json: { admin: true } }),
  );
  await page.route("**/api/service-scheduling?*", (r) =>
    r.fulfill({ json: data }),
  );
  let body: any;
  await page.route("**/api/field/time-requests", (r) => {
    body = r.request().postDataJSON();
    return r.fulfill({ json: { ok: true } });
  });
  await page.goto("/programacao?id=1");
  await page.getByRole("button", { name: "Apontamentos", exact: true }).click();
  await page.getByRole("button", { name: "Ajustar horas" }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Motivo da solicitação / ajuste")
    .fill("Correção pelo planejamento");
  await dialog.getByRole("button", { name: "Salvar ajuste" }).click();
  await expect(dialog).toHaveCount(0);
  expect(body.action).toBe("planner_adjust");
  expect(body.location).toBeUndefined();
});
test("manager task shows reason and approves through the dedicated action", async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: "m8-access", value: "test", domain: "localhost", path: "/" },
  ]);
  const task: any = {
    id: "42",
    source_key: "time-request:33333333-3333-4333-8333-333333333333:manager",
    title: "Aprovar apontamento",
    equipment_name: "Compressor",
    origin: "Aprovação de apontamento",
    customer: "Cliente",
    source_status: "Aguardando aprovação",
    status: "not_started",
    priority: "normal",
    assigned_to: "manager",
    version: 1,
    created_at: "2026-01-01T12:00:00Z",
    updated_at: "2026-01-01T12:00:00Z",
    updated_by: "tech",
  };
  await page.route("**/api/activity", (r) =>
    r.fulfill({ json: { admin: true } }),
  );
  await page.route("**/api/tasks**", (r) => {
    const url = new URL(r.request().url());
    if (url.pathname === "/api/tasks/reminders")
      return r.fulfill({ json: { reminders: [] } });
    if (url.pathname === "/api/tasks/stages")
      return r.fulfill({ json: { stages: [] } });
    return r.fulfill({
      json: url.searchParams.has("id")
        ? {
            task,
            notes: [
              {
                id: "1",
                title: "Solicitação aguardando aprovação",
                description:
                  "Motivo: esqueci de encerrar. Horário solicitado: 08h até 10h.",
                created_at: task.created_at,
                created_name: "Técnico",
              },
            ],
            attachments: [],
            notifications: [],
          }
        : { tasks: [task], users: [], email: "manager" },
    });
  });
  let body: any;
  await page.route("**/api/field/time-requests", (r) => {
    body = r.request().postDataJSON();
    task.status = "completed";
    return r.fulfill({ json: { ok: true } });
  });
  await page.goto("/tarefas?task=42");
  await expect(
    page.getByText(
      "Motivo: esqueci de encerrar. Horário solicitado: 08h até 10h.",
    ),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Aprovar Solicitação", exact: true })
    .click();
  await expect(
    page.getByText(
      "Solicitação aprovada. Tarefa concluída.",
    ),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(body).toMatchObject({
    action: "approve",
    id: "33333333-3333-4333-8333-333333333333",
  });
});

test("planner calendar groups OSs per date and opens all orders in the day", async ({page,context}) => {
  await context.addCookies([{name:"m8-access",value:"test",domain:"localhost",path:"/"}]);
  await page.clock.setFixedTime(new Date("2026-09-29T12:00:00Z"));
  const schedules = Array.from({length:5},(_,i)=>({
    id:String(i+1),company_id:1,order_id:String(100+i),numero_sequencia:100+i,
    cliente_nome:"Cliente "+i,equipamento:"Compressor",operation_count:2,
    programming_status:i===0?"executing":"scheduled",operation_status_counts:{scheduled:2},
    calendar_operations:[{date:"2026-09-29",responsible:"Técnico "+i},{date:"2026-09-29",responsible:"Técnico "+i}],
  }));
  await page.route("**/api/activity",r=>r.fulfill({json:{admin:true}}));
  await page.route("**/api/service-scheduling",r=>r.fulfill({json:{schedules,users:[],canEditSettings:true,email:"planner",settings:{document:{}}}}));
  await page.goto("/programacao");
  await page.getByRole("button",{name:"Calendário",exact:true}).click();
  const calendar=page.getByRole("region",{name:"Calendário de OSs"});
  await expect(calendar.getByText("Técnico 0",{exact:true})).toBeVisible();
  await expect(calendar.getByText("Cliente 0",{exact:true})).toBeVisible();
  await expect(calendar.locator("a.executing")).toHaveCount(1);
  await page.getByRole("button",{name:"+4 OSs",exact:true}).click();
  const dialog=page.getByRole("dialog",{name:"OSs do dia"});
  await expect(dialog.getByRole("link")).toHaveCount(5);
  await expect(dialog.getByRole("link").first()).toHaveAttribute("href","/programacao?id=1");
  await dialog.getByRole("button",{name:"Fechar OSs do dia"}).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button",{name:"Lista",exact:true}).click();
  await expect(page.locator(".scheduling-orders-list")).toBeVisible();
});
