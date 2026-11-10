import {test,expect} from '@playwright/test';
for(const returnMaterials of [false,true])test(`background saves preserve newer answers; send keeps work running until explicit operation closure (returns=${returnMaterials})`,async({page,context})=>{
 await context.addCookies([{name:'m8-access',value:'test',domain:'localhost',path:'/'}]);
 await context.grantPermissions(['geolocation']);await context.setGeolocation({latitude:-27,longitude:-49});
 const template={id:'test',name:'Relatório',stages:[{id:'a',name:'Primeira etapa',fields:[{id:'first',label:'Primeiro texto',type:'text',required:true}]},{id:'b',name:'Segunda etapa',fields:[{id:'second',label:'Segundo texto',type:'text',required:true}]}]};
 const row={id:'op1',schedule_id:1,number:123,position:1,status:'executing',description:'Serviço',can_report:true};
 const operation:any={...row,version:1,document:{responsible:'tech',support:[],checklistId:'test',checklistRun:{template,stages:{a:{status:'released',answers:{}},b:{status:'released',answers:{}}}}}};
 let active:any={id:'session',operation_id:'op1',kind:'work',state:'running',segment_at:new Date().toISOString(),active_seconds:0,pause_seconds:0};
 const detail:any={operation,checked:true,infoRead:true,email:'tech',settings:{document:{checklists:[template],vehicles:[]}},detail:{order:{equipamento:'Compressor'},equipment_links:[]},materials:{items:[],complete:true},history:[],finishPending:['Relatório: envie o relatório.']};
 let firstSave:any,release!:()=>void;const gate=new Promise<void>(r=>{release=r});const actions:string[]=[];
 await page.route('**/api/activity',r=>r.fulfill({json:{admin:true}}));
 await page.route('**/api/field*',async r=>{
  if(r.request().method()==='POST'){
   const body=r.request().postDataJSON();actions.push(body.action);
   if(body.action==='report_save'&&!firstSave){firstSave=body;await gate;}
   if(body.version!==undefined)expect(body.version).toBe(operation.version);
   for(const stage of body.stages||[])operation.document.checklistRun.stages[stage.stageId]={...stage,status:'released'};
   if(body.action==='report_send'){detail.reportSubmission={at:new Date().toISOString(),by:'tech'};operation.document.checklistRun.submission=detail.reportSubmission;detail.finishPending=[];}
   if(body.action==='finish_full'){active=null;operation.status='awaiting_review';row.status='awaiting_review';}
   operation.version++;await r.fulfill({json:{saved:true}});
  }else await r.fulfill({json:r.request().url().includes('?')?{...detail,active}:{email:'tech',rows:[row],active}});
 });
 await page.goto('/tecnico');await page.getByRole('button',{name:/^Programação/}).click();await page.getByText('OS 123',{exact:true}).click();await page.getByRole('button',{name:/OP01/}).click();await page.getByRole('button',{name:'Relatório',exact:true}).click();
 const report=page.getByRole('region',{name:'Relatório técnico da operação'});
 await expect(report.getByRole('button',{name:'Salvar',exact:true})).toBeDisabled();
 await expect(report.getByRole('button',{name:'Enviar',exact:true})).toBeDisabled();
 await report.locator('.checklist-stage-response > summary').filter({hasText:'Primeira etapa'}).click();
 await report.getByLabel('Primeiro texto *',{exact:true}).fill('Primeira resposta');
 await report.locator('.checklist-stage-response > summary').filter({hasText:'Segunda etapa'}).click();
 await expect.poll(()=>!!firstSave).toBe(true);
 await expect(report.getByLabel('Segundo texto *',{exact:true})).toBeEnabled();
 await report.locator('.checklist-stage-response > summary').filter({hasText:'Primeira etapa'}).click();
 await report.getByLabel('Primeiro texto *',{exact:true}).fill('Primeira resposta alterada durante o salvamento');
 await report.locator('.checklist-stage-response > summary').filter({hasText:'Segunda etapa'}).click();
 await report.getByLabel('Segundo texto *',{exact:true}).fill('Escrito durante o salvamento');
 release();
 await expect(report.getByLabel('Segundo texto *',{exact:true})).toHaveValue('Escrito durante o salvamento');
 await expect(report.getByRole('button',{name:'Salvar',exact:true})).toBeEnabled();
 // A scheduled background save may finish between the enabled assertion and the click.
 try{await report.getByRole('button',{name:'Salvar',exact:true}).click({timeout:1000});}
 catch(error){if(!await report.getByRole('button',{name:'Enviar',exact:true}).isEnabled())throw error;}
 await expect(report.getByRole('button',{name:'Salvar',exact:true})).toBeDisabled();
 expect(operation.document.checklistRun.stages.a.answers.first).toBe('Primeira resposta alterada durante o salvamento');
 await report.getByRole('button',{name:'Enviar',exact:true}).click();
 const finish=page.getByRole('dialog',{name:'Conferência antes de finalizar',exact:true});
 await expect(finish).toBeVisible();expect(active?.state).toBe('running');expect(operation.status).toBe('executing');
 await expect(finish.getByRole('alert')).toContainText('não poderá fazer novos apontamentos');
 await finish.getByRole('button',{name:'Continuar trabalhando',exact:true}).click();
 expect(active?.state).toBe('running');
 expect(actions).not.toContain('finish_full');
 await page.getByRole('button',{name:'Finalizar Operação',exact:true}).click();
 await page.getByRole('button',{name:'Encerrar minha participação na operação',exact:true}).click();
 if(returnMaterials){
  await finish.getByRole('button',{name:'Sim, ir para Peças',exact:true}).click();
  await expect(page.getByText('Conferência de peças da OS',{exact:true})).toBeVisible();
  await page.getByRole('checkbox',{name:/Conferi/}).check();
  await page.getByRole('button',{name:/Confirmar conferência/}).click();
  await finish.getByRole('button',{name:'Não há peças a devolver, encerrar operação',exact:true}).click();
 }else await finish.getByRole('button',{name:'Não há peças a devolver, encerrar operação',exact:true}).click();
 await expect.poll(()=>operation.status).toBe('awaiting_review');
 await page.getByRole('button',{name:'Peças',exact:true}).click();
 await expect(page.getByText('Peças desta operação · somente visualização.',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Confirmar conferência',exact:true})).toBeHidden();
 expect(actions.indexOf('finish_full')).toBeGreaterThan(actions.indexOf('report_send'));
 if(returnMaterials)expect(actions.indexOf('materials')).toBeGreaterThan(actions.indexOf('report_send'));
});

test('support report button identifies the responsible technician without exposing report fields',async({page,context})=>{
 await context.addCookies([{name:'m8-access',value:'test',domain:'localhost',path:'/'}]);
 const row={id:'op-helper',schedule_id:1,number:123,position:1,status:'executing',description:'Serviço',can_report:false};
 const operation={...row,version:1,document:{responsible:'tech',support:['helper'],checklistId:'test'}};
 await page.route('**/api/activity',r=>r.fulfill({json:{admin:false}}));
 await page.route('**/api/field*',r=>r.fulfill({json:r.request().url().includes('?')?{operation,email:'helper',responsibleName:'João da Silva',checked:false,infoRead:false,settings:{document:{vehicles:[],checklists:[]}},materials:{complete:true,items:[]},finishPending:[],history:[]}:{email:'helper',rows:[row],active:null}}));
 await page.goto('/tecnico');await page.getByRole('button',{name:/^Programação/}).click();await page.getByText('OS 123',{exact:true}).click();await page.getByRole('button',{name:/OP01/}).click();
 await page.getByRole('button',{name:'Relatório',exact:true}).click();
 await expect(page.getByText(/Você participa desta OS como auxiliar/)).toContainText('João da Silva');
 await expect(page.getByRole('region',{name:'Relatório técnico da operação'})).toHaveCount(0);
});
