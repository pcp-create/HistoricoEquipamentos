import {test,expect} from '@playwright/test';
for(const returnMaterials of [false,true])test(`background saves preserve newer answers; send finishes work and operation (returns=${returnMaterials})`,async({page,context})=>{
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
   if(body.action==='report_send'){active=null;detail.reportSubmission={at:new Date().toISOString(),by:'tech'};operation.document.checklistRun.submission=detail.reportSubmission;detail.finishPending=[];}
   if(body.action==='finish_full'){operation.status='awaiting_review';row.status='awaiting_review';}
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
 await report.getByRole('button',{name:'Salvar',exact:true}).click();
 await expect(report.getByRole('button',{name:'Salvar',exact:true})).toBeDisabled();
 expect(operation.document.checklistRun.stages.a.answers.first).toBe('Primeira resposta alterada durante o salvamento');
 await report.getByRole('button',{name:'Enviar',exact:true}).click();
 const finish=page.getByRole('dialog',{name:'Conferência antes de finalizar',exact:true});
 await expect(finish).toBeVisible();expect(active).toBeNull();
 if(returnMaterials){
  await finish.getByRole('button',{name:'Sim, ir para Peças',exact:true}).click();
  await expect(page.getByText('Conferência de peças da OS',{exact:true})).toBeVisible();
  await page.getByRole('checkbox',{name:/Conferi/}).check();
  await page.getByRole('button',{name:/Confirmar conferência/}).click();
 }else await finish.getByRole('button',{name:'Não, finalizar operação',exact:true}).click();
 await expect.poll(()=>operation.status).toBe('awaiting_review');
 expect(actions.indexOf('finish_full')).toBeGreaterThan(actions.indexOf('report_send'));
 if(returnMaterials)expect(actions.indexOf('materials')).toBeGreaterThan(actions.indexOf('report_send'));
});
