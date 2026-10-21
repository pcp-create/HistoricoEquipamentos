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

  await page.route("**/api/service-scheduling**", async r => {
    if(r.request().method()==='POST') {
      const body=r.request().postDataJSON();
      expect(body.alertTask).toEqual({assignedTo:'tech',description:'Corrigir vazamento',reportMode:'summary'});
      expect(body.action).toBe('review');expect(body.operationId).toBe(operations[2].id);
      operations[2].status='reviewed';operations[2].version++;
      return r.fulfill({json:{operation:operations[2]}});
    }
    return r.fulfill({json:data});
  });
  await page.goto('/programacao?id=1');
  await page.getByRole('button',{name:'Revisar operações da OS',exact:true}).click();
  let dialog=page.getByRole('dialog');
  await expect(dialog).toHaveCount(1);
  await expect(dialog.getByText('3 operações · 1 aguardando revisão · 2 revisadas')).toBeVisible();
  await expect(dialog.getByRole('heading',{name:/14877\/03/})).toBeVisible();
  await expect(dialog.getByRole('button',{name:'Concluir revisão',exact:true})).toBeDisabled();
  await dialog.getByLabel('Conferi o relatório, as peças e os apontamentos desta operação.').check();
  await expect(dialog.getByRole('button',{name:'Concluir revisão',exact:true})).toBeDisabled();
  await expect(dialog.getByRole('region',{name:'Alertas do checklist'})).toContainText('Condição: NOK');
  await expect(dialog.locator('.review-flags .status-alert-selected').first()).toHaveCSS('color','rgb(188, 46, 64)');
  await dialog.getByLabel('Responsável pela tarefa dos alertas').selectOption('tech');
  await dialog.getByLabel('Descrição da tarefa dos alertas').fill('Corrigir vazamento');
  await dialog.getByLabel('Relatório anexo à tarefa dos alertas').selectOption('summary');
  page.once('dialog',d=>d.dismiss());
  await dialog.getByRole('button',{name:'Anterior',exact:true}).click();
  await expect(dialog.getByRole('heading',{name:/14877\/03/})).toBeVisible();
  await dialog.getByRole('button',{name:'Concluir revisão',exact:true}).click();
  await expect(dialog.getByText('3 operações · 0 aguardando revisão · 3 revisadas')).toBeVisible();
  await dialog.getByRole('button',{name:'Anterior',exact:true}).click();
  await expect(dialog.getByRole('heading',{name:/14877\/02/})).toBeVisible();
  await dialog.getByRole('button',{name:'Anterior',exact:true}).click();
  await expect(dialog.getByRole('heading',{name:/14877\/01/})).toBeVisible();
  await expect(dialog.getByRole('button',{name:'Anterior',exact:true})).toBeDisabled();
  await dialog.getByRole('button',{name:'Próxima',exact:true}).click();
  await expect(dialog.getByRole('heading',{name:/14877\/02/})).toBeVisible();
  await dialog.getByRole('button',{name:'Fechar revisão',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button',{name:'Configurações',exact:true}).click();
  await page.getByRole('button',{name:'Checklists',exact:true}).click();
  await page.getByRole('button',{name:'Editar checklist Corretiva'}).click();
  const type=page.getByLabel('Tipo do campo 3 da etapa 1');
  await expect(type).toHaveValue('flag2');
  await expect(page.getByRole('textbox',{name:'Opções do campo 3 da etapa 1',exact:true})).toHaveCount(0);
  await expect(page.getByLabel('Gerar alerta: Condição — NOK')).toBeChecked();
  await type.selectOption('flag3');
  await expect(page.getByLabel('Gerar alerta: Condição — Sim')).toBeVisible();
  await expect(page.getByLabel('Gerar alerta: Condição — Não')).toBeVisible();
  await page.getByLabel('Gerar alerta: Condição — Não').check();
  await type.selectOption('flag4');
  await expect(page.getByLabel('Gerar alerta: Condição — Operando normalmente')).toBeVisible();
  await expect(page.getByLabel('Gerar alerta: Condição — Desligado / Desenergizado')).toBeVisible();
  await page.getByLabel('Gerar alerta: Condição — Bloqueado').check();
  await expect(page.getByLabel('Gerar alerta: Condição — Bloqueado')).toBeChecked();
});
