import { test, expect } from "@playwright/test";
import { blankOperation } from "../lib/service-scheduling/model";
test("AI writing suggestions require explicit acceptance and survive only as draft until saved", async ({ page, context }) => {
  await context.addCookies([{ name: "m8-access", value: "test", domain: "localhost", path: "/" }]);
  await page.route("**/api/activity", r => r.fulfill({ json: { admin: true } }));
  const template = { id: "check", name: "Relatório técnico", stages: [{ id: "s", name: "01. Verificação", groups: [{ id: "g", name: "Inspeção", fields: [{ id: "f", label: "Resultado", type: "text", required: true },{id:"flag",label:"Verificação",type:"flag",options:["OK","NOK","NA"],required:true}] }] }] };
  const operation = { id: "op1", position: 1, version: 1, status: "awaiting_review", document: { ...blankOperation(), responsible: "tech", description: "Revisar compressor", checklistId: "check", checklistRun: { template, submission: { at: "2026-09-30T12:00:00Z", by: "tech" }, stages: { s: { status: "submitted", answers: { f: "Tudo conferido",flag:"OK" } } } } } };
  const data: any = { canEditSettings: true, email: "planner", settings: { version: 1, document: { checklists: [template], serviceTypes: [], calendars: [], vehicles: [] } }, users: [{ email: "tech", display_name: "Técnico", enabled: true }], schedule: { id: "1", company_id: 1, order_id: "100" },
    detail: { order: { numero_sequencia: 123, cliente_nome: "Cliente", equipamento: "Compressor" }, materials: [{ id_m8: "55", item_company: 1, item_order: "100", produto_id: 10, produto_nome: "Filtro", quantidade: 1, unidade_nome: "UN" }], services: [] },
    operations: [operation], usage: [{ item_id: "55", item_company: 1, item_order: "100", withdrawn: 1, allocations: [{ operationId: "op1", position: 1, quantity: 1 }] }], costs: [], events: [{ id: 1, operation_id: "another", action: "work_log", hours: 99 }], fieldSessions: [], fieldEvents: [], requests: [], profit: null };
  await page.route("**/api/service-scheduling**", r => {
    if (r.request().method() === "POST") {
      const body = r.request().postDataJSON();
      expect(body.operationId).toBe("op1");
      if(body.action==='checklist_review_save'){
        expect(body.stages[0].answers).toEqual({f:'Tudo foi conferido.',flag:'OK'});
        operation.document.checklistRun.stages.s.answers=body.stages[0].answers;operation.version++;
        return r.fulfill({json:{operation}});
      }
      expect(body.action).toBe("review");
      operation.status = "reviewed"; operation.version++;
      return r.fulfill({ json: { operation } });
    }
    return r.fulfill({ json: data });
  });
  let calls=0;
  await page.route('**/api/service-scheduling/review-writing',r=>{
    calls++;
    const body=r.request().postDataJSON();
    expect(body.fields).toHaveLength(1);
    expect(body.fields[0].text).toBe('Tudo conferido');
    return r.fulfill({json:{suggestions:[{id:JSON.stringify(['s','f','value']),stageId:'s',fieldId:'f',key:'value',label:'Verificação · Resultado',text:'Tudo conferido',suggested:'Tudo foi conferido.'}]}});
  });
  await page.goto('/programacao?id=1');
  await page.getByRole('button',{name:'Acompanhar execução',exact:true}).click();
  const dialog=page.getByRole('dialog');
  const text=dialog.getByRole('textbox',{name:'Resultado',exact:true});
  const generate=dialog.getByRole('button',{name:'Revisar escrita com IA',exact:true});
  await generate.click();
  await expect(dialog.getByText('Tudo foi conferido.',{exact:true})).toBeVisible();
  await expect(text).toHaveValue('Tudo conferido');
  await expect(dialog.getByRole('button',{name:'Salvar ajustes'})).toHaveCount(0);
  await dialog.getByRole('button',{name:'Manter original'}).click();
  await expect(dialog.locator('.report-writing-suggestion')).toHaveCount(0);
  await generate.click();
  await expect(dialog.getByRole('button',{name:'Aceitar sugestão'})).toBeEnabled();
  await text.fill('Texto alterado manualmente');
  await expect(dialog.getByRole('button',{name:'Aceitar sugestão'})).toBeDisabled();
  await dialog.getByRole('button',{name:'Descartar alterações'}).click();
  await dialog.getByRole('button',{name:'Aceitar sugestão'}).click();
  await expect(text).toHaveValue('Tudo foi conferido.');
  await expect(dialog.getByText('Sugestão aceita no rascunho')).toBeVisible();
  await expect(dialog.locator('.review-report-ai-field')).toHaveCount(1);
  await expect(dialog.getByRole('button',{name:'Concluir revisão'})).toBeDisabled();
  await dialog.getByRole('button',{name:'Salvar ajustes'}).click();
  await expect(dialog.getByRole('button',{name:'Salvar ajustes'})).toHaveCount(0);
  await expect(text).toHaveValue('Tudo foi conferido.');
  expect(calls).toBe(2);
});
