import { test, expect } from "@playwright/test";
import { blankOperation } from "../lib/service-scheduling/model";

test("review alerts show red flags and require task details before completion", async ({
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


  for(const [id,label,comment] of [['g','Filtro','Filtro obstruído'],['h','Dreno','Dreno travado']]){
    template.stages[0].fields.push({...template.stages[0].fields[2],id,label} as any);
    for(const operation of operations){(operation.document.checklistRun.stages.s.answers as any)[id]='NOK';(operation.document.checklistRun.stages.s.details as any)[id]={comment};}
  }
  data.users.push({email:'other',display_name:'Outro responsável',enabled:true});
  let saved:any;
  await page.route('**/api/service-scheduling**',r=>{
    if(r.request().method()==='POST'){
      saved=r.request().postDataJSON();
      expect(saved.operationId).toBe(operations[2].id);
      expect(saved.action).toBe('review');operations[2].status='reviewed';
      operations[2].version++;
      return r.fulfill({json:{operation:operations[2]}});
    }
    return r.fulfill({json:data});
  });
  await page.goto('/programacao?id=1');
  await page.getByRole('button',{name:'Revisar operações da OS',exact:true}).click();
  const dialog=page.getByRole('dialog');
  await dialog.getByLabel('Ir para operação').selectOption(operations[2].id);
  const review=dialog.getByRole('region',{name:'Revisão da operação 03',exact:true});
  await review.getByRole('tab',{name:'Alertas (3)',exact:true}).click();
  await expect(review.locator('.alert-comment').filter({hasText:'Vazamento identificado'})).toBeVisible();
  await expect(review.locator('.alert-comment').filter({hasText:'Filtro obstruído'})).toBeVisible();
  const groupButton=review.getByRole('button',{name:'Agrupar selecionados em uma tarefa'});
  await expect(groupButton).toBeDisabled();
  await review.getByRole('checkbox',{name:/Selecionar alerta:/}).first().check();
  await expect(groupButton).toBeDisabled();
  await expect(review.getByRole('button',{name:'Criar uma tarefa por alerta'})).toBeEnabled();
  await review.getByLabel('Selecionar todos os alertas disponíveis').check();
  await expect(groupButton).toBeEnabled();
  await review.getByRole('button',{name:'Criar uma tarefa por alerta'}).click();
  await expect(review.locator('.alert-task-card')).toHaveCount(3);
  // Removing drafts releases their alerts for regrouping.
  await review.getByRole('button',{name:'Remover tarefa 3',exact:true}).click();
  await review.getByRole('button',{name:'Remover tarefa 2',exact:true}).click();
  await review.getByLabel('Selecionar todos os alertas disponíveis').check();
  await review.getByRole('button',{name:'Agrupar selecionados em uma tarefa'}).click();
  await expect(review.locator('.alert-task-card')).toHaveCount(2);
  await expect(review.getByRole('button',{name:'Concluir revisão'})).toBeDisabled();
  const first=review.getByRole('region',{name:'Tarefa dos alertas 1',exact:true});
  const second=review.getByRole('region',{name:'Tarefa dos alertas 2',exact:true});
  await first.getByLabel('Responsável pela tarefa').selectOption('tech');
  await first.getByLabel('Descrição da tarefa').fill('Corrigir vazamento');
  await first.getByLabel('Relatório anexo').selectOption('summary');
  await second.getByLabel('Responsável pela tarefa').selectOption('other');
  await second.getByLabel('Descrição da tarefa').fill('Revisar filtro e dreno');
  await review.getByRole('tab',{name:'Relatório',exact:true}).click();
  await review.getByRole('tab',{name:'Alertas (3)',exact:true}).click();
  await expect(second.getByLabel('Descrição da tarefa')).toHaveValue('Revisar filtro e dreno');
  expect(saved).toBeUndefined();
  await review.getByLabel('Conferi o relatório, as peças e os apontamentos desta operação.').check();
  await review.getByRole('button',{name:'Concluir revisão',exact:true}).click();
  await expect(dialog.getByText('3 operações · 0 aguardando revisão · 3 revisadas')).toBeVisible();
  expect(saved.alertTasks).toHaveLength(2);
  expect(saved.alertTasks[0].assignedTo).toBe('tech');
  expect(saved.alertTasks[0].alertKeys).toHaveLength(1);
  expect(saved.alertTasks[1].assignedTo).toBe('other');

});
