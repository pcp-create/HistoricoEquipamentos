import {test,expect} from '@playwright/test';
test('task workspace uses employee colors on owner columns and calendar, with settings beside creation',async({page,context})=>{
 await context.addCookies([{name:'m8-access',value:'test',domain:'localhost',path:'/'}]);
 const users=[{email:'maick@example.com',display_name:'Maick Coelho',task_color:'#60a5fa'},{email:'sara@example.com',display_name:'Sara',task_color:'#fbbf24'}];
 const tasks=Array.from({length:12},(_,i)=>({id:String(i+1),source_key:'manual:'+i,title:'Preventiva 2.000 horas',equipment_name:'COMPRESSOR DE PARAFUSO – SÉRIE 1006',customer:'Cliente de demonstração',origin:'Preventiva de Equipamento de Cliente',status:'not_started',priority:'urgent',assigned_to:users[i%2].email,assignee_name:users[i%2].display_name,due_date:'2026-09-25',created_at:'2026-09-25T12:00:00Z'}));
 await page.route('**/api/activity',r=>r.fulfill({json:{admin:true}}));
 await page.route('**/api/tasks',r=>r.fulfill({json:r.request().method()==='POST'?{}:{tasks,users,email:users[0].email}}));
 await page.goto('/tarefas');
 await page.getByRole('button',{name:'Kanban',exact:true}).click();
 await page.getByLabel('Agrupar Kanban por').selectOption('responsible');
 const column=page.getByRole('region',{name:'Sara',exact:true});
 await expect(column).toHaveCSS('border-top-color','rgb(251, 191, 36)');
 await expect(page.getByRole('button',{name:'Configurações de Tarefas',exact:true})).toBeVisible();
 await page.screenshot({path:'/tmp/task-workspace-desktop.png',fullPage:true});
 await page.getByRole('button',{name:'Calendário',exact:true}).click();
 await page.getByLabel('Mês',{exact:true}).fill('2026-09');
 await expect(page.locator('.task-calendar-event').first()).toHaveCSS('border-left-color',/rgb\((96, 165, 250|251, 191, 36)\)/);
 await page.setViewportSize({width:390,height:844});
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 for (const width of [390, 320]) {
  await page.setViewportSize({width,height:844});
  const heading=await page.getByRole('heading',{name:'Tarefas',exact:true}).boundingBox();
  const create=await page.getByRole('button',{name:'Nova tarefa',exact:true}).boundingBox();
  expect(Math.abs(heading!.y-create!.y)).toBeLessThan(12);
  expect(create!.x).toBeGreaterThan(heading!.x);
  const count=await page.locator('.task-scope-controls strong').boundingBox();
  const mine=await page.getByRole('button',{name:'Minhas tarefas',exact:true}).boundingBox();
  expect(Math.abs((count!.y+count!.height/2)-(mine!.y+mine!.height/2))).toBeLessThan(2);
  expect(create!.x + create!.width).toBeLessThanOrEqual(width);
  expect(mine!.x + mine!.width).toBeLessThanOrEqual(width);
 }
 await page.getByRole('button',{name:'Kanban',exact:true}).click();
 for (const width of [320,375,390]) {
  await page.setViewportSize({width,height:844});
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.locator('.task-kanban').evaluate(e=>{e.scrollLeft=300;});
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth && window.scrollX===0)).toBe(true);
 }
 await page.setViewportSize({width:320,height:844});
 for (const control of await page.locator('.task-compact-select').all()) {
  const box=await control.boundingBox();
  const mine=await page.getByRole('button',{name:'Minhas tarefas',exact:true}).boundingBox();
  expect(Math.abs(box!.y-mine!.y)).toBeLessThan(2);
  expect(box!.x+box!.width).toBeLessThanOrEqual(320);
 }
 await page.getByRole('button',{name:'Minhas tarefas',exact:true}).click();
 await expect(page.getByRole('button',{name:'Minhas tarefas',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('.task-scope-controls strong')).toHaveText('6 tarefas');
 await page.getByRole('button',{name:'Minhas tarefas',exact:true}).click();
 await expect(page.locator('.task-scope-controls strong')).toHaveText('12 tarefas');

});
