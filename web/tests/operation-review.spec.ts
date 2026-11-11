import { test, expect } from "@playwright/test";
import { blankOperation } from "../lib/service-scheduling/model";
test("review window isolates operation data and enables PDF after successful review", async ({ page, context }) => {
  await context.addCookies([{ name: "m8-access", value: "test", domain: "localhost", path: "/" }]);
  await page.route("**/api/activity", r => r.fulfill({ json: { admin: true } }));
  const template = { id: "check", name: "Relatório técnico", stages: [{ id: "s", name: "01. Verificação", groups: [{ id: "g", name: "Inspeção", fields: [{ id: "f", label: "Resultado", type: "text", required: true },{id:"flag",label:"Verificação",type:"flag",options:["OK","NOK","NA"],alertOptions:[],required:true},{id:"photos",label:"Fotos do relatório",type:"photo",maxPhotos:5}] }] }] };
  const operation = { id: "op1", position: 1, version: 1, status: "awaiting_review", document: { ...blankOperation(), responsible: "tech", description: "Revisar compressor", checklistId: "check", checklistRun: { template, submission: { at: "2026-09-30T12:00:00Z", by: "tech" }, stages: { s: { status: "submitted", answers: { f: "Tudo conferido",flag:"OK",photos:["11","12"] } } } } } };
  const data: any = { canEditSettings: true, email: "planner", settings: { version: 1, document: { checklists: [template], serviceTypes: [], calendars: [], vehicles: [] } }, users: [{ email: "tech", display_name: "Técnico", enabled: true }], schedule: { id: "1", company_id: 1, order_id: "100" },
    detail: { order: { numero_sequencia: 123, cliente_nome: "Cliente", equipamento: "Compressor" }, materials: [{ id_m8: "55", item_company: 1, item_order: "100", produto_id: 10, produto_nome: "Filtro", quantidade: 1, unidade_nome: "UN",movement:{delivered:4,returnedInApp:2,received:1} }], services: [] },
    operations: [operation], usage: [{ item_id: "55", item_company: 1, item_order: "100", withdrawn: 1, allocations: [{ operationId: "op1", position: 1, quantity: 1 }] }], costs: [], events: [{ id: 1, operation_id: "another", action: "work_log", hours: 99 }], fieldSessions: [], fieldEvents: [], requests: [], profit: null };
  let saveAttempts=0;
  await page.route("**/api/service-scheduling**", r => {
    if (r.request().method() === "POST") {
      const body = r.request().postDataJSON();
      expect(body.operationId).toBe("op1");
      if(body.action==='checklist_review_save'){
        if(++saveAttempts===1)return r.fulfill({status:400,json:{error:'Não foi possível salvar os ajustes. Tente novamente.'}});
        expect(body.stages[0].answers).toEqual({f:'Corrigido pelo planejador',flag:'NOK',photos:['12','13']});
        operation.document.checklistRun.stages.s.answers=body.stages[0].answers;operation.version++;
        return r.fulfill({json:{operation}});
      }
      expect(body.action).toBe("review");
      operation.status = "reviewed"; operation.version++;
      return r.fulfill({ json: { operation } });
    }
    return r.fulfill({ json: data });
  });
  const pixel=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6zS8AAAAASUVORK5CYII=','base64');
  await page.route('**/api/service-scheduling/photos/**',r=>r.fulfill({body:pixel,contentType:'image/png'}));
  await page.route('**/api/service-scheduling/photos',r=>r.fulfill({json:{id:'13'}}));
  await page.goto("/programacao?id=1");
  await page.getByRole("button", { name: "Acompanhar execução", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Revisão da operação 01" });
  await expect(dialog).toBeVisible();
  const photos=dialog.locator('.review-edit-photos').last();
  await expect(photos.locator('.review-photo-card')).toHaveCount(2);
  const order=await photos.locator(':scope > *').evaluateAll(els=>els.map(el=>el.className));
  expect(order.at(-1)).toContain('report-photo-card');
  await photos.getByRole('button',{name:'Remover foto 1 — Fotos do relatório',exact:true}).click();
  const confirmation=page.getByRole('dialog',{name:'Remover foto do relatório?',exact:true});
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole('button',{name:'Cancelar',exact:true}).click();
  await expect(photos.locator('.review-photo-card')).toHaveCount(2);
  await expect(dialog.getByRole('button',{name:'Salvar ajustes',exact:true})).toHaveCount(0);
  await photos.getByRole('button',{name:'Remover foto 1 — Fotos do relatório',exact:true}).click();
  await confirmation.getByRole('button',{name:'Remover foto',exact:true}).click();
  await expect(photos.locator('.review-photo-card')).toHaveCount(1);
  await photos.getByRole('button',{name:'Adicionar foto: Fotos do relatório',exact:true}).click();
  await expect(photos.getByRole('button',{name:/Escolher da galeria/})).toBeVisible();
  await photos.getByLabel('Selecionar fotos: Fotos do relatório',{exact:true}).setInputFiles({name:'nova.png',mimeType:'image/png',buffer:pixel});
  await expect(photos.locator('.review-photo-card')).toHaveCount(2);
  await photos.screenshot({path:'/tmp/review-photo-cards.png'});

  await expect(dialog.getByRole('textbox',{name:'Resultado',exact:true})).toHaveValue('Tudo conferido');
  await expect(dialog.getByRole('radio',{name:'OK',exact:true})).toBeChecked();
  await expect(dialog.getByRole('radio',{name:'NA',exact:true})).not.toBeChecked();
  await dialog.getByRole('textbox',{name:'Resultado',exact:true}).fill('Corrigido pelo planejador');
  await expect(dialog.locator('.review-report-row').filter({has:page.getByText('Ativo',{exact:true})}).getByRole('button')).toBeDisabled();
  await dialog.getByRole('radio',{name:'NOK',exact:true}).check();
  await expect(dialog.getByRole('button',{name:'Concluir revisão',exact:true})).toBeDisabled();
  const footer=dialog.locator('.operation-review-footer');
  const saveBounds=await dialog.getByRole('button',{name:'Salvar ajustes',exact:true}).boundingBox();
  const returnBounds=await dialog.getByRole('button',{name:'Devolver relatório ao técnico',exact:true}).boundingBox();
  expect(Math.abs(saveBounds!.y-returnBounds!.y)).toBeLessThan(2);
  expect((await footer.boundingBox())!.height).toBeLessThan(115);

  await dialog.getByRole('tab',{name:'Peças',exact:true}).click();
  await dialog.getByRole('tab',{name:'Relatório',exact:true}).click();
  await expect(dialog.getByRole('textbox',{name:'Resultado',exact:true})).toHaveValue('Corrigido pelo planejador');
  await expect(dialog.getByText('Há ajustes pendentes. Salve antes de concluir a revisão.')).toBeVisible();
  await expect(dialog.getByRole('region',{name:'Etapa 1: salvar ajustes'}).getByRole('button',{name:'Salvar ajustes',exact:true})).toBeVisible();
  await dialog.getByRole('button',{name:'Salvar ajustes',exact:true}).click();
  await expect(dialog.getByRole('alert')).toContainText('Não foi possível salvar os ajustes.');
  await expect(dialog.getByRole('button',{name:'Concluir revisão',exact:true})).toBeDisabled();
  await expect(dialog.getByRole('textbox',{name:'Resultado',exact:true})).toHaveValue('Corrigido pelo planejador');
  await page.setViewportSize({width:390,height:844});
  expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  expect((await footer.boundingBox())!.height).toBeLessThan(160);
  await dialog.locator('.operation-review-footer').screenshot({path:'/tmp/review-footer-mobile.png'});
  await page.setViewportSize({width:1440,height:1080});
  await dialog.getByRole('button',{name:'Salvar ajustes',exact:true}).click();
  await expect(dialog.getByRole('button',{name:'Salvar ajustes',exact:true})).toHaveCount(0);
  await expect(dialog.getByRole("img", { name: "RJ Compressores", exact: true })).toHaveAttribute("src", "/logo-rj.png");
  await expect(dialog.locator(".review-report-stage h4 svg")).toHaveCount(0);
  await expect(dialog.locator(".technical-report-number").first()).toHaveText("01");
  await expect(dialog.getByRole("radio")).toHaveCount(3);
  await page.screenshot({ path: "/tmp/checklist-review-layout.png", fullPage: true });
  await expect(dialog.getByRole("link", { name: "Gerar PDF", exact: true })).toHaveCount(0);
  await dialog.getByRole("tab", { name: "Peças", exact: true }).click();
  await expect(dialog.getByText("10 · Filtro", { exact: true })).toBeVisible();
  const parts=dialog.getByRole('table');
  await expect(parts.getByRole('columnheader',{name:'Entregue',exact:true})).toBeVisible();
  await expect(parts.getByRole('columnheader',{name:'Devolvido',exact:true})).toBeVisible();
  await expect(parts.getByRole('columnheader',{name:'Recebido',exact:true})).toBeVisible();
  const cells=parts.getByRole('row').nth(1).getByRole('cell');
  await expect(cells.nth(4)).toHaveText('4');
  await expect(cells.nth(5)).toHaveText('2');
  await expect(cells.nth(6)).toHaveText('1');
  await expect(parts.locator('input')).toHaveCount(0);

  await dialog.getByRole("tab", { name: "Apontamentos", exact: true }).click();
  await expect(dialog.getByText("Nenhum apontamento registrado nesta OS.")).toBeVisible();
  await expect(dialog.getByRole("checkbox")).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Concluir revisão", exact: true })).toBeEnabled();
  await expect(dialog.getByText(/Ao concluir, declaro: li, revisei/)).toBeVisible();
  await dialog.getByRole("button", { name: "Concluir revisão", exact: true }).click();
  await expect(dialog.getByRole("link", { name: "Gerar PDF", exact: true })).toHaveAttribute("href", "/api/service-scheduling/checklist-pdf?operationId=op1&mode=complete");
  await page.setViewportSize({ width: 390, height: 844 });
  await dialog.getByRole("tab", { name: "Relatório", exact: true }).click();
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await dialog.getByRole("button", { name: "Fechar revisão", exact: true }).click();
  await expect(dialog).toHaveCount(0);
});
