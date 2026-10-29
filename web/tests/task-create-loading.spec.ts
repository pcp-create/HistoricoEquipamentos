import {test,expect} from '@playwright/test';
test('new task opens while the task list is still loading',async({page,context})=>{
 await context.addCookies([{name:'m8-access',value:'test',domain:'localhost',path:'/'}]);
 await page.route('**/api/**',r=>r.fulfill({json:{}}));
 await page.route('**/api/task-stages',r=>r.fulfill({json:{stages:[]}}));
 let release!:()=>void;
 const pending=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/api/tasks',async r=>{await pending;await r.fulfill({json:{tasks:[],users:[]}});});
 try {
  await page.goto('/tarefas');
  const button=page.getByRole('button',{name:'Nova tarefa',exact:true});
  await expect(button).toBeEnabled();await button.click();
  await expect(page.getByRole('heading',{name:'Nova tarefa',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Criar tarefa',exact:true})).toBeEnabled();
 } finally {release();}
});
