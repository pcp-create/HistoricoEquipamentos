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
  await page.goto("/tecnico");
  await page.getByRole("button", { name: "Programação" }).click();
  await page.getByText("OS 14830", { exact: true }).click();
  await page.getByRole("button", { name: /Operação 1/ }).click();
  await expect(
    page.getByRole("button", { name: "Iniciar atividade" }),
  ).toBeDisabled();
  await expect(page.getByRole("button", { name: "Peças", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Informações", exact: true }).click();
  await page.getByRole("button", { name: "Li e compreendi as informações" }).click();
  await page.getByRole("button", { name: "Peças", exact: true }).click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Confirmar conferência" }).click();
  await expect(page.getByRole("button", { name: "Informações", exact: true })).toBeHidden();
  await page.getByRole("button", { name: "Voltar ao menu", exact: true }).last().click();
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
 const row={id:'op1',schedule_id:1,number:14849,position:1,description:'Inspeção do compressor',date:'2026-09-29',time:'08:00',status:'executing',customer:'Cliente de teste'};
 const operation:any={...row,version:1,document:{responsible:'tech',support:[],checklistId:'ccp',checklistRun:{template,stages:{stage:{status:'released',answers:{}}}}}};
 const detail:any={operation,checked:true,infoRead:true,email:'tech',settings:{document:{checklists:[template],vehicles:[]}},detail:{order:{equipamento:'1795 - COMPRESSOR DE PARAFUSO - TPE 25 - SÉRIE 55533'},equipment_links:[]},materials:{items:[],complete:true},history:[]};
 let saved:any;
 await page.route('**/api/activity',r=>r.fulfill({json:{admin:true}}));
 await page.route('**/api/field*',async r=>{if(r.request().method()==='POST'){saved=r.request().postDataJSON();for(const stage of saved.stages||[])operation.document.checklistRun.stages[stage.stageId]={...stage,status:'released'};if(saved.action==='report_send_partial')operation.document.checklistRun.partialSubmission={at:new Date().toISOString(),name:'Técnico',by:'tech'};
if(saved.action==='report_send'){detail.reportSubmission={at:new Date().toISOString(),name:'Técnico',by:'tech'};operation.document.checklistRun.submission=detail.reportSubmission;for(const stage of Object.values(operation.document.checklistRun.stages) as any[])stage.status='submitted';}
operation.version++;await r.fulfill({json:{saved:true}});}else await r.fulfill({json:r.request().url().includes('?')?detail:{email:'tech',displayName:'Técnico',rows:[row],active:null}});});
 await page.goto('/tecnico');await page.getByRole('button',{name:'Programação'}).click();await page.getByText('OS 14849',{exact:true}).click();await page.getByRole('button',{name:/Operação 1/}).click();await page.getByRole('button',{name:'Relatório',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Relatório · OS 14849 · Operação 1'});
 await expect(dialog).toBeVisible();expect(await dialog.boundingBox()).toEqual({x:0,y:0,width:390,height:844});
 await dialog.locator('.checklist-stage-response > summary').click();await dialog.locator('.checklist-response-group > summary').click();
 await dialog.getByRole('radio',{name:'OK',exact:true}).check();await dialog.getByLabel('Relatório técnico',{exact:true}).fill('Texto ainda não salvo');
 await dialog.getByLabel('Data da leitura',{exact:true}).fill('2026-09-29');
 const controls=await dialog.getByRole('radio').evaluateAll(els=>els.map(el=>el.getBoundingClientRect().top));expect(new Set(controls).size).toBe(1);
 expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
 await page.screenshot({path:'/tmp/field-report-fullscreen.png'});
 await dialog.getByRole('button',{name:'Voltar',exact:true}).click();await expect(dialog).toBeHidden();
 await page.getByRole('button',{name:'Relatório',exact:true}).click();await expect(dialog.getByLabel('Relatório técnico',{exact:true})).toHaveValue('Texto ainda não salvo');
 await dialog.getByRole('button',{name:'Salvar Relatório',exact:true}).click();await expect(dialog.getByText('Registro salvo.',{exact:true})).toBeVisible();expect(saved.action).toBe('report_save');expect(saved.stages[0].answers.note).toBe('Texto ainda não salvo');
 await dialog.getByRole('button',{name:'Enviar parcial',exact:true}).click();
 await expect(dialog.getByText(/Você pode continuar editando/)).toBeVisible();
 await expect(dialog.getByLabel('Relatório técnico',{exact:true})).toBeEnabled();
 await dialog.getByLabel('Relatório técnico',{exact:true}).fill('Alteração após envio parcial');
 await dialog.getByRole('button',{name:'Enviar completo',exact:true}).click();
 await expect(dialog.getByText(/Relatório enviado completo em/)).toBeVisible();
 expect(saved.stages[0].answers.note).toBe('Alteração após envio parcial');
 await expect(dialog.getByRole('button',{name:'Salvar Relatório',exact:true})).toHaveCount(0);
 await expect(dialog.getByLabel('Relatório técnico',{exact:true})).toBeDisabled();
 await page.setViewportSize({width:320,height:740});expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
 await page.keyboard.press('Escape');await expect(dialog).toBeHidden();
});
