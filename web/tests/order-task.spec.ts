import { test, expect } from "@playwright/test";
import { blankOperation } from "../lib/service-scheduling/model";

test("order task requires reviewed reports and submits the selected attachment and assignee", async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: "m8-access", value: "test", domain: "localhost", path: "/" },
  ]);
  await page.route("**/api/activity", (r) =>
    r.fulfill({ json: { admin: true } }),
  );
  const template = {
    id: "c",
    name: "Corretiva",
    stages: [
      {
        id: "s",
        name: "Medições",
        fields: [
          { id: "meter", type: "number", label: "Horímetro" },
          { id: "empty", type: "text", label: "Campo vazio" },
          {
            id: "f",
            type: "flag",
            label: "Condição",
            options: ["OK", "NOK", "NA"],
            internalNote: true,
          },
        ],
      },
    ],
  };
  const operations = [1, 2, 3].map((n) => ({
    id: `10000000-0000-4000-8000-00000000000${n}`,
    version: 1,
    position: n,
    status: n === 3 ? "awaiting_review" : "reviewed",
    document: {
      ...blankOperation(),
      description: `Atendimento ${n}`,
      responsible: "tech",
      checklistId: "c",
      checklistRun: {
        template,
        stages: {
          s: {
            status: "submitted",
            answers: { meter: n * 1000, f: "OK" },
            details: { f: { internalNote: "Nota para orçamento" } },
          },
        },
        submission: { at: "2026-09-30T12:00:00Z", by: "tech" },
      },
    },
  }));
  const data = {
    canEditSettings: true,
    email: "planner",
    settings: {
      document: {
        checklists: [template],
        serviceTypes: [],
        calendars: [],
        vehicles: [],
      },
    },
    users: [{ email: "tech", display_name: "Técnico", enabled: true }],
    schedule: { id: "1", company_id: 1, order_id: "14877" },
    detail: {
      order: {
        numero_sequencia: 14877,
        cliente_nome: "Cliente",
        equipamento: "Compressor",
      },
      materials: [],
      services: [],
    },
    operations,
    usage: [],
    costs: [],
    events: [],
    fieldEvents: [],
    requests: [],
    profit: null,
    fieldSessions: [1, 2].map((n) => ({
      id: `s${n}`,
      operation_id: operations[n - 1].id,
      actor: "tech",
      kind: "work",
      state: "finished",
      active_seconds: 3600,
      pause_seconds: 0,
      started_at: `2026-09-${n === 1 ? "30" : "29"}T12:00:00Z`,
      finished_at: `2026-09-${n === 1 ? "30" : "29"}T13:00:00Z`,
    })),
  };


  let sent:any;
  let tasks:any[]=[];
  await page.route("**/api/tasks?**",r=>{const url=new URL(r.request().url());expect(url.searchParams.get("orderId")).toBe("14877");expect(url.searchParams.get("orderCompany")).toBe("1");return r.fulfill({json:{tasks}});});
  await page.route('**/api/service-scheduling**',r=>r.fulfill({json:data}));
  await page.route('**/api/service-scheduling/order-task',r=>{sent=r.request().postDataJSON();tasks=[{id:'123',title:'Tarefa da OS 14877',status:'not_started',assignee_name:'Técnico'}];return r.fulfill({json:{taskId:'123'}});});
  await page.goto('/programacao?id=1');
  await page.getByRole('button',{name:'Gerar tarefa da OS',exact:true}).click();
  let dialog=page.getByRole('dialog',{name:'Gerar tarefa da OS',exact:true});
  await expect(dialog.getByRole('button',{name:'Criar tarefa',exact:true})).toBeDisabled();
  await expect(dialog.getByRole('alert')).toContainText('Conclua a revisão');
  await dialog.getByRole('button',{name:'Fechar tarefa da OS'}).click();
  operations[2].status='reviewed';
  await page.reload();
  await page.getByRole('button',{name:'Gerar tarefa da OS',exact:true}).click();
  await dialog.getByLabel('Responsável pela tarefa').selectOption('tech');
  await dialog.getByLabel('Relatório anexo').selectOption('budget');
  await dialog.getByLabel('Comentário da tarefa').fill('Preparar orçamento para o cliente.');
  await dialog.getByRole('button',{name:'Criar tarefa',exact:true}).click();
  await expect(dialog.getByRole('link',{name:'#123'})).toHaveAttribute('href','/tarefas?task=123');
  expect(sent).toMatchObject({scheduleId:'1',assignedTo:'tech',reportMode:'budget',description:'Preparar orçamento para o cliente.'});
  expect(sent.requestId).toMatch(/^[a-f0-9-]{36}$/);
  await dialog.getByRole('button',{name:'Fechar tarefa da OS'}).click();
  const linked=page.getByRole('region',{name:'Tarefas da OS',exact:true});
  await expect(linked.getByRole('link',{name:/TAR-123/})).toBeHidden();
  await linked.locator('summary').click();
  await expect(linked.getByRole('link',{name:/TAR-123/})).toBeVisible();
  await expect(linked).toContainText('Responsável: Técnico');
  await linked.locator('summary').click();
  await expect(linked.getByRole('link',{name:/TAR-123/})).toBeHidden();
});
