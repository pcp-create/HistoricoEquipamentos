import { test, expect } from "@playwright/test";
import { blankOperation } from "../lib/service-scheduling/model";
test("review window isolates operation data and enables PDF after successful review", async ({ page, context }) => {
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
        expect(body.stages[0].answers).toEqual({f:'Corrigido pelo planejador',flag:'NOK'});
        operation.document.checklistRun.stages.s.answers=body.stages[0].answers;operation.version++;
        return r.fulfill({json:{operation}});
      }
      expect(body.action).toBe("review");
      operation.status = "reviewed"; operation.version++;
      return r.fulfill({ json: { operation } });
    }
    return r.fulfill({ json: data });
  });
  await page.goto("/programacao?id=1");
  await page.getByRole("button", { name: "Acompanhar", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Revisão da operação 01" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('textbox',{name:'Resultado',exact:true})).toHaveValue('Tudo conferido');
  await expect(dialog.getByRole('radio',{name:'OK',exact:true})).toBeChecked();
  await expect(dialog.getByRole('radio',{name:'NA',exact:true})).not.toBeChecked();
  await dialog.getByRole('textbox',{name:'Resultado',exact:true}).fill('Corrigido pelo planejador');
  await dialog.getByRole('radio',{name:'NOK',exact:true}).check();
  await expect(dialog.getByRole('button',{name:'Concluir revisão',exact:true})).toBeDisabled();
  await dialog.getByRole('button',{name:'Peças',exact:true}).click();
  await dialog.getByRole('button',{name:'Relatório',exact:true}).click();
  await expect(dialog.getByRole('textbox',{name:'Resultado',exact:true})).toHaveValue('Corrigido pelo planejador');
  await dialog.getByRole('button',{name:'Salvar correções',exact:true}).click();
  await expect(dialog.getByRole('button',{name:'Salvar correções',exact:true})).toBeDisabled();
  await expect(dialog.getByRole("img", { name: "RJ Compressores", exact: true })).toHaveAttribute("src", "/logo-rj.png");
  await expect(dialog.locator(".review-report-stage h4 svg")).toHaveCount(0);
  await expect(dialog.locator(".technical-report-number").first()).toHaveText("01");
  await expect(dialog.getByRole("radio")).toHaveCount(3);
  await page.screenshot({ path: "/tmp/checklist-review-layout.png", fullPage: true });
  await expect(dialog.getByRole("link", { name: "Gerar PDF", exact: true })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Peças", exact: true }).click();
  await expect(dialog.getByText("10 · Filtro", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Apontamentos", exact: true }).click();
  await expect(dialog.getByText("Nenhum apontamento registrado nesta OS.")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Concluir revisão", exact: true })).toBeDisabled();
  await dialog.getByRole("checkbox", { name: /Conferi o relatório/ }).check();
  await dialog.getByRole("button", { name: "Concluir revisão", exact: true }).click();
  await expect(dialog.getByRole("link", { name: "Gerar PDF", exact: true })).toHaveAttribute("href", "/api/service-scheduling/checklist-pdf?operationId=op1&mode=complete");
  await page.setViewportSize({ width: 390, height: 844 });
  await dialog.getByRole("button", { name: "Relatório", exact: true }).click();
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await dialog.getByRole("button", { name: "Fechar revisão", exact: true }).click();
  await expect(dialog).toHaveCount(0);
});
