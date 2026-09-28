import {test,expect} from '@playwright/test';
test('drawer selects stages, advances within the role and rolls back errors',async({page,context})=>{
 await context.addCookies([{name:'m8-access',value:'test',domain:'localhost',path:'/'}]);
 await page.route('**/api/activity',r=>r.fulfill({json:{}}));
 let task:any={id:'1',version:1,title:'Teste',source_key:'manual:1',origin:'Tarefa manual',status:'not_started',priority:'normal',stage_id:null};let reject=false;
 const detail=()=>({task,notes:[],notifications:[],attachments:[]});
 await page.route('**/api/tasks',r=>{if(r.request().method()==='POST'){const b=r.request().postDataJSON();if(b.action==='stage'){if(reject)return r.fulfill({status:409,json:{error:'Conflito de edição'}});task={...task,stage_id:b.stageId,status:'in_progress',version:task.version+1};return r.fulfill({json:detail()});}return r.fulfill({json:{}});}return r.fulfill({json:{tasks:[task],users:[]}});});
 await page.route('**/api/tasks?id=1',r=>r.fulfill({json:detail()}));
 await page.route('**/api/tasks/reminders**',r=>r.fulfill({json:{reminders:[]}}));
 await page.route('**/api/task-stages',r=>r.fulfill({json:{stages:[{id:'a',job_title:'Comercial',name:'Contato',sort_order:1},{id:'b',job_title:'Comercial',name:'Proposta',sort_order:3},{id:'c',job_title:'Técnico',name:'Visita',sort_order:1}]}}));
 await page.goto('/tarefas?task=1');
 const select=page.getByRole('combobox',{name:'Etapa da tarefa'}),next=page.getByRole('button',{name:'Avançar para a próxima etapa'});
 await expect(next).toBeDisabled();await select.selectOption('a');await expect(select).toHaveValue('a');await expect(next).toBeEnabled();await next.click();await expect(select).toHaveValue('b');await expect(next).toBeDisabled();
 reject=true;await select.selectOption('c');await expect(page.locator('.task-drawer').getByRole('alert')).toContainText('Conflito de edição');await expect(select).toHaveValue('b');
 await page.setViewportSize({width:390,height:844});expect(await page.locator('.task-stage-picker').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
});
