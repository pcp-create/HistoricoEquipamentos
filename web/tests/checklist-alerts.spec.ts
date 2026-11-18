import {orderReviewSignature} from "../lib/service-scheduling/order-review";
import { test, expect } from "@playwright/test";
import { blankOperation } from "../lib/service-scheduling/model";

test("order alerts group different operations without blocking individual reviews", async ({
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
            type: "flag2",
            alertOptions: ["NOK"],
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
            answers: { meter: n * 1000, f: "NOK" },
            details: { f: { comment: "Vazamento identificado", internalNote: "Nota para orçamento" } },
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


  let saved:any;
  await page.route('**/api/service-scheduling**',r=>{
    if(r.request().method()==='POST'){
      const body=r.request().postDataJSON();
      if(body.action==='order_review'){
        saved=body;
        (data as any).orderReview={signature:orderReviewSignature(operations),checklistAlertTasks:[{taskId:'501',assignedTo:'tech',alerts:operations.map(o=>({operationId:o.id,operationPosition:o.position,stageId:'s',fieldId:'f',stage:'Medições',label:'Condição',value:'NOK',comment:'Vazamento identificado'}))}]};
        return r.fulfill({json:{orderReview:(data as any).orderReview}});
      }
      expect(body.action).toBe('review');expect(body.operationId).toBe(operations[2].id);
      expect(body.alertTasks).toBeUndefined();operations[2].status='reviewed';operations[2].version++;
      return r.fulfill({json:{operation:operations[2]}});
    }
    return r.fulfill({json:data});
  });
  await page.goto('/programacao?id=1');
  await page.getByRole('button',{name:'Revisar operações',exact:true}).click();
  const dialog=page.getByRole('dialog');
  await dialog.getByLabel('Ir para operação').selectOption(operations[2].id);
  const review=dialog.getByRole('region',{name:'Revisão da operação 03',exact:true});
  await expect(review.getByRole('tab',{name:/Alertas/})).toHaveCount(0);
  await expect(dialog.getByRole('button',{name:'Concluir revisão da OS',exact:true})).toBeDisabled();
  await review.getByRole('button',{name:'Concluir revisão',exact:true}).click();
  await expect(dialog.getByText('3 operações · 0 aguardando revisão · 3 revisadas')).toBeVisible();
  await expect(dialog.getByRole('link',{name:'Gerar PDF',exact:true})).toHaveCount(0);
  await dialog.getByRole('button',{name:'Alertas da OS (3)',exact:true}).click();
  const alerts=dialog.locator('.order-review-alert-panel');
  await expect(alerts.locator('.alert-comment')).toHaveCount(3);
  await alerts.getByLabel('Selecionar todos os alertas disponíveis').check();
  await alerts.getByRole('button',{name:'Agrupar selecionados em uma tarefa'}).click();
  await expect(alerts.locator('.alert-task-card')).toHaveCount(1);
  const task=alerts.getByRole('region',{name:'Tarefa dos alertas 1',exact:true});
  await expect(task).toContainText('um único PDF agrupado com os relatórios de todas as operações da OS');
  await expect(task).toContainText('Operação 01');await expect(task).toContainText('Operação 03');
  await expect(dialog.getByRole('button',{name:'Concluir revisão da OS',exact:true})).toBeDisabled();
  await task.getByLabel('Responsável pela tarefa').selectOption('tech');
  await task.getByLabel('Descrição da tarefa').fill('Corrigir os vazamentos das três operações');
  await dialog.getByRole('button',{name:'Operações',exact:true}).click();
  await dialog.getByRole('button',{name:'Alertas da OS (3)',exact:true}).click();
  await expect(task.getByLabel('Descrição da tarefa')).toHaveValue('Corrigir os vazamentos das três operações');
  await dialog.getByRole('button',{name:'Concluir revisão da OS',exact:true}).click();
  await expect(dialog.getByText('Revisão da OS concluída. Exportação do relatório liberada.')).toBeVisible();
  expect(saved.alertTasks).toHaveLength(1);expect(saved.alertTasks[0].alertKeys).toHaveLength(3);
  await expect(alerts.getByRole('link',{name:'#501'})).toBeVisible();
  await dialog.getByRole('button',{name:'Operações',exact:true}).click();
  await expect(dialog.getByRole('link',{name:'Gerar PDF',exact:true})).toHaveCount(3);
});
