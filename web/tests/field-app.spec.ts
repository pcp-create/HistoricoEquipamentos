import { test, expect } from "@playwright/test";
test("mobile technician confirms pieces before starting work with location", async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: "m8-access", value: "test", domain: "localhost", path: "/" },
  ]);
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: -27, longitude: -49 });
  await page.setViewportSize({ width: 390, height: 844 });
  const row = {
    id: "op1",
    schedule_id: 1,
    number: 14830,
    customer: "Cliente de teste",
    city: "Timbó",
    state: "SC",
    equipment: "Compressor GA110",
    date: "2026-09-29",
    time: "08:00",
    position: 1,
    description: "Manutenção",
    status: "awaiting_execution",
  };
  let checked = false;
  let infoRead = false;
  let active: any = null;
  const actions: any[] = [];
  await page.route("**/api/activity", (r) => r.fulfill({ json: {} }));
  await page.route("**/api/field*", async (r) => {
    if (r.request().method() === "POST") {
      const b = r.request().postDataJSON();
      actions.push(b);
      if (b.action === "info_read") infoRead=true;
      if (b.action === "materials") checked = true;
      if (b.action === "start_work")
        active = {
          id: "session",
          operation_id: "op1",
          kind: "work",
          state: "running",
          segment_at: new Date().toISOString(),
          active_seconds: 0,
          pause_seconds: 0,
        };
      await r.fulfill({ json: { ok: true } });
      return;
    }
    await r.fulfill({
      json: r.request().url().includes("?")
        ? {
            checked, infoRead,
            operation: {
              ...row,
              document: {
                responsible: "tech@test.com",
                internalNote: "Inspecionar antes de iniciar",
              },
            },
            email: "tech@test.com",
            settings: {
              document: { vehicles: [], pauseReasons: [], checklists: [] },
            },
            materials: { complete: true, items: [] },
            history: [],
          }
        : { email: "tech@test.com", rows: [row], active },
    });
  });
  await page.clock.setFixedTime(new Date("2026-09-29T12:00:00Z"));
  await page.goto("/tecnico");
  await page.getByRole("button", { name: "Programação" }).click();
  await page.getByRole("button", { name: "Calendário", exact: true }).click();
  await page.getByRole("button", { name: "28/09/2026: 0 OSs", exact: true }).click();
  await expect(page.getByText("Nenhuma OS programada para esta data.")).toBeVisible();
  await expect(page.getByText("OS 14830", { exact: true })).toBeHidden();
  await page.getByRole("button", { name: "Hoje", exact: true }).click();
  await expect(page.getByText("OS 14830", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Próximo mês" }).click();
  await expect(page.getByText("outubro de 2026", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Lista", exact: true }).click();
  await page.getByText("OS 14830", { exact: true }).click();
  await page.getByRole("button", { name: /Operação 01/ }).click();
  await expect(
    page.getByRole("button", { name: "Iniciar atividade" }),
  ).toBeDisabled();
  await expect(page.getByRole("button", { name: "Peças", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Informações", exact: true }).click();
  await page.getByRole("button", { name: "Li e compreendi as informações" }).click();
  await page.getByRole("button", { name: "Peças", exact: true }).click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Confirmar conferência" }).click();
  await expect(page.getByRole("heading", { name: "Conferência de peças da OS" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Informações", exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Iniciar atividade" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Iniciar atividade" }).click();
  await expect(
    page.getByRole("button", { name: "Pausar atividade" }),
  ).toBeVisible();
  expect(actions.map((x) => x.action)).toEqual(["info_read", "materials", "start_work"]);
  expect(actions[1].location.latitude).toBe(-27);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const light=page.getByRole("button", {name:"Finalizar Operação",exact:true}).locator('.field-menu-light');
  const bounds=await light.boundingBox();
  expect(bounds?.width).toBe(10);
  expect(bounds?.height).toBe(10);
  await page.screenshot({ path: "/tmp/field-pilot.png", fullPage: true });
});

test('report fills the phone viewport, keeps drafts when returning and saves all stages',async({page,context})=>{
 await context.addCookies([{name:'m8-access',value:'test',domain:'localhost',path:'/'}]);
 await context.grantPermissions(['geolocation']);await context.setGeolocation({latitude:-27,longitude:-49});
 await page.setViewportSize({width:390,height:844});
 const template={id:'ccp',name:'Corretiva Compressor Parafuso',prefix:'CCP',items:[],stages:[{id:'stage',name:'01. Inspeções',groups:[{id:'group',name:'Condições do equipamento',fields:[{id:'status',label:'Avaliar todos os componentes do compressor',type:'flag',required:true,options:['OK','NOK','NA'],comment:true},{id:'date',label:'Data da leitura',type:'date'},{id:'note',label:'Relatório técnico',type:'textarea'}]}]}]};
 template.stages[0].groups.push({id:'other',name:'Outras verificações',fields:[]} as any);
 const row={id:'op1',schedule_id:1,number:14849,position:1,description:'Inspeção do compressor',date:'2026-09-29',time:'08:00',status:'executing',customer:'Cliente de teste'};
 const operation:any={...row,version:1,document:{responsible:'tech',support:[],checklistId:'ccp',checklistRun:{template,stages:{stage:{status:'released',answers:{}}}}}};
 const detail:any={operation,checked:true,infoRead:true,email:'tech',settings:{document:{checklists:[template],vehicles:[]}},detail:{order:{equipamento:'1795 - COMPRESSOR DE PARAFUSO - TPE 25 - SÉRIE 55533'},equipment_links:[]},materials:{items:[],complete:true},history:[]};
 let saved:any;
 await page.route('**/api/activity',r=>r.fulfill({json:{admin:true}}));
 await page.route('**/api/field*',async r=>{if(r.request().method()==='POST'){saved=r.request().postDataJSON();for(const stage of saved.stages||[])operation.document.checklistRun.stages[stage.stageId]={...stage,status:'released'};if(saved.action==='report_send_partial')operation.document.checklistRun.partialSubmission={at:new Date().toISOString(),name:'Técnico',by:'tech'};
if(saved.action==='report_send'){detail.reportSubmission={at:new Date().toISOString(),name:'Técnico',by:'tech'};operation.document.checklistRun.submission=detail.reportSubmission;for(const stage of Object.values(operation.document.checklistRun.stages) as any[])stage.status='submitted';}
operation.version++;await r.fulfill({json:{saved:true}});}else await r.fulfill({json:r.request().url().includes('?')?detail:{email:'tech',displayName:'Técnico',rows:[row],active:null}});});
 await page.goto('/tecnico');await page.getByRole('button',{name:'Programação'}).click();await page.getByText('OS 14849',{exact:true}).click();await page.getByRole('button',{name:/Operação 01/}).click();await page.getByRole('button',{name:'Relatório',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Relatório · OS 14849/01 · Cliente de teste'});
 await expect(dialog).toBeVisible();expect(await dialog.boundingBox()).toEqual({x:0,y:0,width:390,height:844});
 await dialog.locator('.checklist-stage-response > summary').click();await dialog.locator('.checklist-response-group > summary').first().click();
 await dialog.getByRole('radio',{name:'OK',exact:true}).check();await dialog.getByLabel('Relatório técnico',{exact:true}).fill('Texto ainda não salvo');
 await dialog.getByLabel('Data da leitura',{exact:true}).fill('2026-09-29');
 const controls=await dialog.getByRole('radio').evaluateAll(els=>els.map(el=>el.getBoundingClientRect().top));expect(new Set(controls).size).toBe(1);
 expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
 await page.screenshot({path:'/tmp/field-report-fullscreen.png'});
 await expect(dialog.getByRole('button',{name:/Recolher grupo/})).toHaveCount(0);
 await dialog.locator('.checklist-response-group > summary').nth(1).click();
 await expect(dialog.locator('.checklist-response-group').first()).not.toHaveAttribute('open','');
 await expect(dialog.locator('.checklist-response-group').nth(1)).toHaveAttribute('open','');
 await dialog.locator('.checklist-response-group > summary').first().click();
 await expect(dialog.locator('.checklist-response-group').nth(1)).not.toHaveAttribute('open','');
 await expect(dialog.getByLabel('Relatório técnico',{exact:true})).toHaveValue('Texto ainda não salvo');
 await dialog.getByRole('button',{name:'Voltar',exact:true}).click();await expect(dialog).toBeHidden();
 await page.getByRole('button',{name:'Relatório',exact:true}).click();await expect(dialog.getByLabel('Relatório técnico',{exact:true})).toHaveValue('Texto ainda não salvo');
 await dialog.getByRole('button',{name:'Salvar Relatório',exact:true}).click();await expect(dialog.getByText('Registro salvo.',{exact:true})).toBeVisible();expect(saved.action).toBe('report_save');expect(saved.stages[0].answers.note).toBe('Texto ainda não salvo');
 await dialog.getByRole('button',{name:'Enviar parcial',exact:true}).click();
 await expect(dialog).toBeHidden();
 await expect(page.getByRole('button',{name:'Relatório',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Relatório',exact:true}).click();
 await expect(dialog.getByText(/Você pode continuar editando/)).toBeVisible();
 await expect(dialog.getByLabel('Relatório técnico',{exact:true})).toBeEnabled();
 await dialog.getByLabel('Relatório técnico',{exact:true}).fill('Alteração após envio parcial');
 await dialog.getByRole('button',{name:'Enviar completo',exact:true}).click();
 await expect(dialog).toBeHidden();
 await expect(page.getByRole('button',{name:'Relatório',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Relatório',exact:true}).click();
 await expect(dialog.getByText(/Relatório enviado completo em/)).toBeVisible();
 expect(saved.stages[0].answers.note).toBe('Alteração após envio parcial');
 await expect(dialog.getByRole('button',{name:'Salvar Relatório',exact:true})).toHaveCount(0);
 await expect(dialog.getByLabel('Relatório técnico',{exact:true})).toBeDisabled();
 // Planner returns the submitted report while the technician keeps the page open.
 delete detail.reportSubmission;
 delete operation.document.checklistRun.submission;
 operation.document.checklistRun.reportReturnedAt = new Date().toISOString();
 operation.document.checklistRun.stages.stage.status = 'released';
 operation.version++;
 (row as any).version = operation.version;
 await dialog.getByRole('button',{name:'Voltar',exact:true}).click();
 await page.getByRole('button',{name:'Atualizar',exact:true}).click();
 await page.getByRole('button',{name:'Relatório',exact:true}).click();
 await expect(dialog.getByLabel('Relatório técnico',{exact:true})).toBeEnabled();
 await expect(dialog.getByLabel('Relatório técnico',{exact:true})).toHaveValue('Alteração após envio parcial');
 await dialog.getByLabel('Relatório técnico',{exact:true}).fill('Correção após devolução');
 await dialog.getByRole('radio',{name:'NOK',exact:true}).check();
 await dialog.getByRole('button',{name:'Salvar Relatório',exact:true}).click();
 await expect(dialog.getByText('Registro salvo.',{exact:true})).toBeVisible();
 expect(saved.stages[0].answers.note).toBe('Correção após devolução');
 expect(saved.stages[0].answers.status).toBe('NOK');
 await page.setViewportSize({width:320,height:740});expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
 await page.keyboard.press('Escape');await expect(dialog).toBeHidden();
});

test("orders and operations open one at a time and scroll to their heading", async ({ page, context }) => {
  await context.addCookies([{ name: "m8-access", value: "test", domain: "localhost", path: "/" }]);
  await page.setViewportSize({ width: 390, height: 600 });
  const rows = [
    { id: "first", schedule_id: 1, number: 100, position: 1 },
    { id: "second", schedule_id: 1, number: 100, position: 2 },
    { id: "third", schedule_id: 2, number: 200, position: 1 },
    // Extra orders provide enough scroll space below the selected block.
    ...Array.from({ length: 5 }, (_, i) => ({ id: `extra-${i}`, schedule_id: i + 3, number: i + 300, position: 1 })),
  ].map(row => ({ ...row, customer: "Cliente de teste", description: "Manutenção", date: "2026-09-30", time: "08:00", status: "awaiting_execution" }));
  await page.route("**/api/activity", r => r.fulfill({ json: {} }));
  await page.route("**/api/field*", r => {
    const id = new URL(r.request().url()).searchParams.get("operation");
    return r.fulfill({ json: id ? {
      operation: { ...rows.find(row => row.id === id), document: {} },
      settings: { document: { vehicles: [], pauseReasons: [], checklists: [] } },
      materials: { complete: true, items: [] }, history: [],
    } : { rows, active: null } });
  });
  await page.goto("/tecnico");
  await page.getByRole("button", { name: "Programação" }).click();
  const firstOrder = page.locator(".field-order").filter({ has: page.getByText("OS 100", { exact: true }) });
  const secondOrder = page.locator(".field-order").filter({ has: page.getByText("OS 200", { exact: true }) });
  const nearTop = async (locator: ReturnType<typeof page.locator>) => {
    await expect.poll(async () => Math.abs((await locator.boundingBox())!.y - 12)).toBeLessThan(3);
  };
  await firstOrder.locator("summary").click();
  await nearTop(firstOrder);
  const firstOperation = firstOrder.getByRole("button", { name: /Operação 01/ });
  const secondOperation = firstOrder.getByRole("button", { name: /Operação 02/ });
  await firstOperation.click();
  await expect(firstOperation).toHaveAttribute("aria-expanded", "true");
  await nearTop(firstOperation);
  await secondOperation.click();
  await expect(firstOperation).toHaveAttribute("aria-expanded", "false");
  await expect(secondOperation).toHaveAttribute("aria-expanded", "true");
  await nearTop(secondOperation);
  await secondOrder.locator("summary").click();
  await expect(firstOrder).not.toHaveAttribute("open", "");
  await expect(secondOrder).toHaveAttribute("open", "");
  await nearTop(secondOrder);
  await firstOrder.locator("summary").click();
  await expect(secondOrder).not.toHaveAttribute("open", "");
  await expect(secondOperation).toHaveAttribute("aria-expanded", "false");
});

test("partial material withdrawals allow only the remaining reserved balance", async ({ page, context }) => {
  await context.addCookies([{ name: "m8-access", value: "test", domain: "localhost", path: "/" }]);
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: -27, longitude: -49 });
  await page.setViewportSize({ width: 390, height: 844 });
  const row = { id: "second", schedule_id: 1, number: 100, position: 2, description: "Manutenção", status: "executing" };
  const item: any = { id_m8: "55", item_company: 1, item_order: "100", produto_id: 55, produto_nome: "Filtro", quantidade: 1, unidade_nome: "UN", usage: {
    withdrawn: 0.5, version: 1, allocations: [{ operationId: "first", position: 1, quantity: 0.5, by: "ana", name: "Ana", at: "2026-09-30T12:00:00Z" }],
  } };
  let saved: any;
  await page.route("**/api/activity", r => r.fulfill({ json: {} }));
  await page.route("**/api/field*", async r => {
    if (r.request().method() === "POST") {
      saved = r.request().postDataJSON();
      return r.fulfill({ json: { saved: true } });
    }
    return r.fulfill({ json: new URL(r.request().url()).searchParams.has("operation") ? {
      operation: { ...row, document: {} }, infoRead: true, checked: true,
      settings: { document: { vehicles: [], pauseReasons: [], checklists: [] } },
      materials: { complete: true, items: [item] }, history: [],
    } : { rows: [row], active: null } });
  });
  await page.goto("/tecnico");
  await page.getByRole("button", { name: "Programação" }).click();
  await page.getByText("OS 100", { exact: true }).click();
  await page.getByRole("button", { name: /Operação 02/ }).click();
  await page.getByRole("button", { name: "Peças", exact: true }).click();
  const amount = page.getByRole("spinbutton", { name: "Retirado nesta operação" });
  await expect(amount).toBeEnabled();
  await expect(amount).toHaveValue("0");
  await expect(page.locator(".field-part-balances dd")).toHaveText(["1", "0,5", "0,5"]);
  await page.getByText("Ver retiradas (1)", { exact: true }).click();
  await expect(page.getByText("Ana", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "/tmp/field-material-layout.png", fullPage: true });
  await amount.fill("0.6");
  await page.getByRole("checkbox").check();
  await expect(page.getByRole("button", { name: "Confirmar conferência" })).toBeDisabled();
  await amount.fill("0.5");
  await page.getByRole("button", { name: "Confirmar conferência" }).click();
  await expect(page.getByRole("button", { name: "Peças", exact: true })).toBeVisible();
  expect(saved.quantityScope).toBe("operation");
  expect(saved.items[0].withdrawn).toBe(0.5);
  item.usage.withdrawn = 1;
  item.usage.allocations[0].quantity = 1;
  await page.getByRole("button", { name: "Peças", exact: true }).click();
  await expect(amount).toBeDisabled();
  await expect(page.getByText(/Quantidade reservada totalmente retirada/)).toBeVisible();
});

test("operation completion requires all modules and confirms material returns", async ({ page, context }) => {
  await context.addCookies([{ name: "m8-access", value: "test", domain: "localhost", path: "/" }]);
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: -27, longitude: -49 });
  const row = { id: "op", schedule_id: 1, number: 100, position: 1, status: "executing" };
  let pending = ["Relatório: conclua as etapas obrigatórias e faça o envio completo."];
  const actions: string[] = [];
  await page.route("**/api/activity", r => r.fulfill({ json: {} }));
  await page.route("**/api/field*", r => {
    if (r.request().method() === "POST") {
      actions.push(r.request().postDataJSON().action);
      return r.fulfill({ json: { saved: true } });
    }
    return r.fulfill({ json: new URL(r.request().url()).searchParams.has("operation") ? {
      operation: { ...row, document: { responsible: "tech" } }, email: "tech", infoRead: true, checked: true,
      finishPending: pending, settings: { document: { vehicles: [], pauseReasons: [], checklists: [] } },
      materials: { complete: true, items: [] }, history: [],
    } : { rows: [row], active: null } });
  });
  await page.goto("/tecnico");
  await page.getByRole("button", { name: "Programação" }).click();
  await page.getByText("OS 100", { exact: true }).click();
  const operation = page.getByRole("button", { name: /Operação 01/ });
  await operation.click();
  await page.getByRole("button", { name: "Finalizar Operação", exact: true }).click();
  const finish = page.getByRole("button", { name: "Finalizar operação · enviar para revisão", exact: true });
  await expect(finish).toBeDisabled();
  await expect(page.getByText(pending[0], { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Finalização parcial/ })).toHaveCount(0);
  pending = [];
  await operation.click();
  await operation.click();
  await expect(finish).toBeEnabled();
  await finish.click();
  const dialog = page.getByRole("dialog", { name: "Conferência antes de finalizar" });
  await expect(dialog).toBeVisible();
  expect(actions).toEqual([]);
  await dialog.getByRole("button", { name: "Sim, ir para Peças" }).click();
  await expect(page.getByRole("heading", { name: "Conferência de peças da OS" })).toBeVisible();
  expect(actions).toEqual([]);
  await page.getByRole("button", { name: "Voltar ao menu", exact: true }).last().click();
  await page.getByRole("button", { name: "Finalizar Operação", exact: true }).click();
  await finish.click();
  await dialog.getByRole("button", { name: "Não, finalizar operação" }).click();
  await expect.poll(() => actions).toEqual(["finish_full"]);
});
