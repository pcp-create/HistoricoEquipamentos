import {test,expect} from '@playwright/test';
test('a slow or failed completion keeps its card and does not block other tasks',async({page,context})=>{
 await context.addCookies([{name:'m8-access',value:'test',domain:'localhost',path:'/'}]);
 await page.route('**/api/activity',r=>r.fulfill({json:{}}));
 await page.route('**/api/task-stages',r=>r.fulfill({json:{stages:[]}}));
 const tasks=[1,2].map(id=>({id:String(id),version:1,title:`Conclusão de teste ${id}`,status:'in_progress',priority:'normal',source_key:`manual:${id}`}));
 let release!:()=>void;
 const held=new Promise<void>(resolve=>{release=resolve;});
 let firstAttempt=true;
 const writes:string[]=[];
 await page.route('**/api/tasks',async r=>{
  if(r.request().method()==='GET')return r.fulfill({json:{users:[],tasks}});
  const body=r.request().postDataJSON();
  if(body.action==='sync')return r.fulfill({json:{}});
  writes.push(body.id);
  if(body.id==='1'&&firstAttempt){firstAttempt=false;await held;return r.fulfill({status:503,json:{error:'Falha de confirmação de teste'}});}
  const task=tasks.find(t=>t.id===body.id)!;
  task.status='completed';task.version++;
  return r.fulfill({json:{task}});
 });
 try{
  await page.goto('/tarefas');
  const first=page.locator('.task-kanban-card').filter({hasText:'Conclusão de teste 1'});
  const second=page.locator('.task-kanban-card').filter({hasText:'Conclusão de teste 2'});
  await first.getByRole('button',{name:'Concluir tarefa',exact:true}).click();
  await expect(first).toBeVisible();
  await expect(first.getByRole('button',{name:'Concluir tarefa',exact:true})).toBeDisabled();
  await expect(second.getByRole('button',{name:'Concluir tarefa',exact:true})).toBeEnabled();
  await second.getByRole('button',{name:'Concluir tarefa',exact:true}).click();
  await expect(second).toHaveCount(0);
  await expect(first).toBeVisible();
  expect(writes).toEqual(['1','2']);
  release();
  await expect(page.getByText('Falha de confirmação de teste',{exact:true})).toBeVisible();
  await expect(first.getByRole('button',{name:'Concluir tarefa',exact:true})).toBeEnabled();
  await first.getByRole('button',{name:'Concluir tarefa',exact:true}).click();
  await expect(first).toHaveCount(0);
  expect(writes).toEqual(['1','2','1']);
 }finally{release();}
});
