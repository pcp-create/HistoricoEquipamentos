import {test,expect} from '@playwright/test';
test('Kanban stage columns follow configured order and persist card moves',async({page,context})=>{
 await context.addCookies([{name:'m8-access',value:'test',domain:'localhost',path:'/'}]);
 let tasks:any[]=[{id:'1',version:1,title:'Contato cliente',source_key:'manual:1',origin:'Tarefa manual',status:'not_started',priority:'normal',stage_id:null}];
 await page.route('**/api/activity',r=>r.fulfill({json:{}}));
 await page.route('**/api/task-stages',r=>r.fulfill({json:{stages:[{id:'c',job_title:'Técnico',name:'Visita',sort_order:1},{id:'b',job_title:'Comercial',name:'Proposta',sort_order:2},{id:'a',job_title:'Comercial',name:'Contato',sort_order:1}]}}));
 let reject=false;
 await page.route('**/api/tasks',r=>{if(r.request().method()==='POST'){const body=r.request().postDataJSON();if(body.action==='stage'){if(reject)return r.fulfill({status:409,json:{error:'Conflito de etapa'}});tasks=[{...tasks[0],stage_id:body.stageId,status:'in_progress',version:tasks[0].version+1}];return r.fulfill({json:{task:tasks[0],notes:[],attachments:[],notifications:[]}});}return r.fulfill({json:{}});}return r.fulfill({json:{tasks,users:[]}});});
 await page.goto('/tarefas');await page.getByLabel('Agrupar Kanban por').selectOption('stage');
 const columns=page.locator('.task-kanban-column');await expect(columns).toHaveCount(4);await expect(columns.nth(0)).toHaveAttribute('aria-label','Sem etapa');await expect(columns.nth(1)).toHaveAttribute('aria-label','Contato');
 await page.getByLabel('Cargo da etapa',{exact:true}).selectOption('comercial');await expect(columns).toHaveCount(3);await expect(page.locator('.task-kanban-column[aria-label="Visita"]')).toHaveCount(0);
 const card=page.locator('.task-kanban-card');await card.dragTo(columns.nth(1));await expect(columns.nth(1).locator('.task-kanban-card')).toHaveCount(1);await expect(card).toContainText('Em andamento');
 reject=true;await card.dragTo(columns.nth(2));await expect(page.locator('.task-error')).toContainText('Conflito de etapa');await expect(columns.nth(1).locator('.task-kanban-card')).toHaveCount(1);
 await page.setViewportSize({width:390,height:844});expect(await page.locator('.task-results-toolbar').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
 await columns.nth(2).getByRole('button',{name:'+ Adicionar tarefa',exact:true}).click();await expect(page.getByText('Etapa inicial: Proposta',{exact:true})).toBeVisible();
});
