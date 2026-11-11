import {test,expect} from '@playwright/test';
test('operation task offers automatic completion guidance without manual complete or reopen actions',async({page,context})=>{
 await context.addCookies([{name:'m8-access',value:'test',domain:'localhost',path:'/'}]);
 await page.route('**/api/activity',r=>r.fulfill({json:{admin:true}}));
 const task={id:'42',source_key:'manual:schedule-operation:10000000-0000-4000-8000-000000000001',title:'Operação em revisão',equipment_name:'Compressor',customer:'Cliente',origin:'Programação de OSs',status:'in_progress',source_status:'review',priority:'normal',assigned_to:null,followers:[],version:1,created_at:new Date().toISOString(),updated_at:new Date().toISOString()};
 await page.route('**/api/tasks**',r=>{
  const url=new URL(r.request().url());
  if(url.pathname.endsWith('/reminders'))return r.fulfill({json:{reminders:[]}});
  if(url.pathname.endsWith('/checklists'))return r.fulfill({json:{lists:[]}});
  return r.fulfill({json:url.searchParams.has('id')?{task,notes:[],attachments:[],notifications:[]}:{tasks:[task],users:[],email:'planner',syncedAt:new Date().toISOString()}});
 });
 await page.goto('/tarefas');await page.getByText('TAR-42 · Operação em revisão',{exact:true}).click();
 const dialog=page.getByRole('dialog');
 await expect(dialog.getByRole('button',{name:'Concluir tarefa',exact:true})).toHaveCount(0);
 await expect(dialog.getByRole('button',{name:'Reabrir tarefa',exact:true})).toHaveCount(0);
 await expect(dialog.getByText('Esta tarefa será concluída automaticamente quando a operação atingir o status Revisado.',{exact:true})).toBeVisible();
});
