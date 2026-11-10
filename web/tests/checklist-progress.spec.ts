import {test,expect} from '@playwright/test';

test('NOK missing its photo is red on report card, stage and group; attaching its photo clears the light',async({page,context})=>{
 await context.addCookies([{name:'m8-access',value:'test',domain:'localhost',path:'/'}]);
 await context.grantPermissions(['geolocation']);await context.setGeolocation({latitude:-27,longitude:-49});
 const fan={id:'fan',label:'Ventilador e resfriador',type:'flag',required:true,alertOptions:['NOK']};
 const template={id:'test',name:'Corretiva',stages:[{id:'inspection',name:'Inspeções',fields:[fan],groups:[{id:'components',name:'Componentes',fields:[fan]}]}]};
 const row={id:'op1',schedule_id:1,number:15321,position:1,status:'executing',description:'Serviço',can_report:true};
 const operation:any={...row,version:1,document:{responsible:'tech',support:[],checklistId:'test',checklistRun:{template,stages:{inspection:{status:'released',answers:{fan:'NOK'},details:{fan:{comment:'Está travado'}}}}}}};
 const active={id:'session',operation_id:'op1',kind:'work',state:'running',segment_at:new Date().toISOString(),active_seconds:0,pause_seconds:0};
 const detail={operation,checked:true,infoRead:true,email:'tech',settings:{document:{checklists:[template],vehicles:[]}},detail:{order:{equipamento:'Compressor'},equipment_links:[]},materials:{items:[],complete:true},history:[],finishPending:['Relatório: envie o relatório.']};
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jM1cAAAAASUVORK5CYII=','base64');
 await page.route('**/api/activity',r=>r.fulfill({json:{admin:true}}));
 await page.route('**/api/service-scheduling/photos**',r=>r.request().method()==='POST'?r.fulfill({json:{id:'568'}}):r.fulfill({body:png,contentType:'image/png'}));
 await page.route('**/api/field*',async r=>{
  if(r.request().method()==='POST'){
   const body=r.request().postDataJSON();
   for(const stage of body.stages||[])operation.document.checklistRun.stages[stage.stageId]={...stage,status:'released'};
   operation.version++;await r.fulfill({json:{saved:true}});
  }else await r.fulfill({json:r.request().url().includes('?')?{...detail,active}:{email:'tech',rows:[row],active}});
 });
 await page.goto('/tecnico');await page.getByRole('button',{name:/^Programação/}).click();await page.getByText('OS 15321',{exact:true}).click();await page.getByRole('button',{name:/OP01/}).click();
 const card=page.getByRole('button',{name:'Relatório',exact:true});
 await expect(card.locator('.field-menu-light')).toHaveClass(/required/);
 await card.click();
 const report=page.getByRole('region',{name:'Relatório técnico da operação'});
 const stage=report.locator('.checklist-stage-response');const stageLight=stage.locator(':scope > summary .checklist-progress');
 await expect(stageLight).toHaveClass(/required/);
 await stage.locator(':scope > summary').click();
 const group=stage.locator('.checklist-response-group');const groupLight=group.locator(':scope > summary .checklist-progress');
 await expect(groupLight).toHaveClass(/required/);await group.locator(':scope > summary').click();
 await expect(report.getByRole('button',{name:'Enviar',exact:true})).toBeDisabled();
 await group.getByLabel('Selecionar fotos: Ventilador e resfriador',{exact:true}).setInputFiles({name:'ventilador.png',mimeType:'image/png',buffer:png});
 await expect(group.locator('.checklist-photos img')).toHaveCount(1);
 await expect(groupLight).toHaveClass(/complete/);await expect(stageLight).toHaveClass(/complete/);
 await report.getByRole('button',{name:'Salvar',exact:true}).click();
 await expect(report.getByRole('button',{name:'Enviar',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'Voltar',exact:true}).click();
 await expect(card.locator('.field-menu-light')).toHaveClass(/complete/);
});
