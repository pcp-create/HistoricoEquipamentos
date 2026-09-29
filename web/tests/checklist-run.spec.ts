import {test,expect} from '@playwright/test';
import {blankOperation} from '../lib/service-scheduling/model';
import ccp from '../lib/service-scheduling/templates/ccp.json';
test('technician checklist supports releasing, draft values, returning stages and mobile layout',async({page,context})=>{
 await context.addCookies([{name:'m8-access',value:'test',domain:'localhost',path:'/'}]);
 await page.addInitScript(()=>{(window as any).SpeechRecognition=class {
  onstart:any;onresult:any;onend:any;onerror:any;
  start(){this.onstart?.();setTimeout(()=>this.onresult?.({resultIndex:0,results:[Object.assign([{transcript:'Relatório ditado pelo técnico.'}],{isFinal:true})]}),0);}
  stop(){this.onend?.();}abort(){this.onend?.();}
 };});
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jM1cAAAAASUVORK5CYII=','base64');let photoId=0;
 await page.route('**/api/activity',r=>r.fulfill({json:{admin:true}}));
 const template:any=structuredClone(ccp);template.stages[1].groups[0].fields[0].options=['Aprovado','Reprovado'];
 const operation:any={id:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',position:1,version:1,status:'scheduled',document:{...blankOperation(),responsible:'tech',checklistId:'ccp'}};
 const data:any={email:'tech',canEditSettings:true,settings:{version:1,document:{serviceTypes:['Interno'],checklists:[template],vehicles:[],calendars:[{id:'standard',name:'Padrão',week:[]}]}},users:[{email:'tech',display_name:'Técnico',enabled:true,job_title:'Técnico',hourly_cost:10}],schedule:{id:'1',company_id:1,order_id:'100'},detail:{order:{numero_sequencia:'100',cliente_nome:'Cliente',equipamento:'Compressor'},materials:[],services:[],equipment_links:[{equipment_id:'7',name:'Compressor',serial:'123'}]},usage:[],costs:[],events:[],operations:[operation]};
 await page.route('**/api/service-scheduling**',r=>{
  if(r.request().url().includes('/photos'))return r.request().method()==='POST'?r.fulfill({json:{id:String(++photoId)}}):r.fulfill({body:png,contentType:'image/png'});
  if(r.request().method()==='GET')return r.fulfill({json:data});
  const b=r.request().postDataJSON();
  if(b.action.startsWith('checklist_')){
   const run=operation.document.checklistRun||{template,stages:{}};
   const old=run.stages[b.stageId]||{answers:{}};
   run.stages[b.stageId]={...old,status:b.action==='checklist_submit'?'submitted':'released',...(b.answers&&b.action!=='checklist_release'?{answers:b.answers}:{}),updatedAt:operation.version};
   if(b.equipmentId)run.equipmentId=b.equipmentId;
   operation.document.checklistRun=run;operation.version++;
  }
  return r.fulfill({json:{operation}});
 });
 await page.goto('/programacao?id=1');
 await page.getByRole('button',{name:'Acompanhar',exact:true}).click();
 const first=page.locator('.checklist-stage-response').nth(0);
 await first.locator(':scope > summary').click();
 await first.getByRole('button',{name:'Liberar etapa para o técnico'}).click();
 await first.getByLabel('Horímetro total', {exact:false}).fill('1234');
 await expect(first.getByLabel('Equipamento da OS')).toHaveValue('7');
 await expect(first.getByText(/Não salvo/)).toBeVisible();
 const second=page.locator('.checklist-stage-response').nth(1);
 await second.locator(':scope > summary').click();
 await second.getByRole('button',{name:'Liberar etapa para o técnico'}).click();
 await expect(first.getByLabel('Horímetro total',{exact:false})).toHaveValue('1234');
 await second.getByLabel('Avaliar todos os componentes do compressor',{exact:false}).first().selectOption('Reprovado');
 await first.getByRole('button',{name:'Salvar rascunho da etapa'}).click();
 await expect(second.getByLabel('Avaliar todos os componentes do compressor',{exact:false}).first()).toHaveValue('Reprovado');
 await first.getByRole('button',{name:'Devolver etapa preenchida'}).click();
 await expect(first.locator(':scope > summary')).toContainText('Devolvida');
 await first.locator(':scope > summary').click();
 await expect(first.getByRole('button',{name:'Reabrir para correção'})).toBeVisible();
 const report=page.locator('.checklist-stage-response').nth(3);
 await report.locator(':scope > summary').click();await report.getByRole('button',{name:'Liberar etapa para o técnico'}).click();
 await report.getByRole('button',{name:'Ditar texto',exact:false}).first().click();
 await expect(report.getByLabel('1 — Como encontrei *',{exact:true})).toHaveValue('Relatório ditado pelo técnico.');
 await report.getByRole('button',{name:'Parar microfone',exact:true}).click();
 const photos=page.locator('.checklist-stage-response').nth(4);
 await photos.locator(':scope > summary').click();await photos.getByRole('button',{name:'Liberar etapa para o técnico'}).click();
 await photos.getByLabel('Selecionar fotos: Fotos gerais',{exact:true}).setInputFiles([{name:'a.png',mimeType:'image/png',buffer:png},{name:'b.png',mimeType:'image/png',buffer:png}]);
 await expect(photos.locator('.checklist-photos img')).toHaveCount(2);
 const acceptance=page.locator('.checklist-stage-response').nth(5);
 await acceptance.locator(':scope > summary').click();await acceptance.getByRole('button',{name:'Liberar etapa para o técnico'}).click();
 const canvas=acceptance.locator('canvas').first();await canvas.scrollIntoViewIfNeeded();const box=(await canvas.boundingBox())!;
 await page.mouse.move(box.x+20,box.y+30);await page.mouse.down();await page.mouse.move(box.x+100,box.y+55,{steps:5});await page.mouse.up();
 await acceptance.getByRole('button',{name:'Usar assinatura',exact:true}).first().click();
 await expect(acceptance.locator('.checklist-signature img')).toHaveCount(1);
 await page.setViewportSize({width:390,height:844});
 expect(await page.locator('.scheduling-page').evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
 expect(await page.locator('.checklist-run').evaluate(e=>e.getBoundingClientRect().width)).toBeLessThan(390);
});
