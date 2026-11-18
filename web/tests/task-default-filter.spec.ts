import {test,expect} from '@playwright/test';
test('Kanban starts with open tasks and allows explicitly selecting all tasks',async({page,context})=>{
 await context.addCookies([{name:'m8-access',value:'test',domain:'localhost',path:'/'}]);
 await page.route('**/api/activity',r=>r.fulfill({json:{}}));
 await page.route('**/api/task-stages',r=>r.fulfill({json:{stages:[]}}));
 await page.route('**/api/tasks',r=>r.fulfill({json:{users:[],tasks:[
 {id:'1',title:'Pendente teste',status:'not_started',priority:'normal',source_key:'manual:1'},
 {id:'2',title:'Andamento teste',status:'in_progress',priority:'normal',source_key:'manual:2'},
 {id:'3',title:'Concluída teste',status:'completed',priority:'normal',source_key:'manual:3'},
 ]}}));
 await page.goto('/tarefas');
 const cards=page.locator('.task-kanban-card');
 await expect(cards).toHaveCount(2);
 await expect(page.locator('.task-kanban-card').filter({hasText:'Concluída teste'})).toHaveCount(0);
 const filters=page.locator('details').filter({has:page.locator('select').filter({has:page.locator('option[value="active"]')})});
 await filters.locator('summary').click();
 const status=filters.locator('select').filter({has:page.locator('option[value="active"]')});
 await expect(status).toHaveValue('active');
 await status.selectOption({label:'Todas'});
 await expect(cards).toHaveCount(3);
 await filters.getByRole('button',{name:'Limpar',exact:true}).click();
 await expect(status).toHaveValue('active');
 await expect(cards).toHaveCount(2);
});

test('following scope shows watched tasks assigned to other people and switches independently from mine',async({page,context})=>{
 await context.addCookies([{name:'m8-access',value:'test',domain:'localhost',path:'/'}]);
 await page.route('**/api/activity',r=>r.fulfill({json:{}}));
 await page.route('**/api/task-stages',r=>r.fulfill({json:{stages:[]}}));
 const tasks=[
 {id:'1',title:'Tarefa acompanhada',assigned_to:'other@test.com',followers:[' ME@TEST.COM '],status:'not_started',priority:'normal',source_key:'manual:1'},
 {id:'2',title:'Tarefa minha',assigned_to:'me@test.com',followers:[],status:'in_progress',priority:'normal',source_key:'manual:2'},
 {id:'3',title:'Tarefa de outra pessoa',assigned_to:'other@test.com',followers:['other@test.com'],status:'not_started',priority:'normal',source_key:'manual:3'},
 ];
 await page.route('**/api/tasks',r=>r.fulfill({json:{email:'me@test.com',users:[{email:'me@test.com',display_name:'Eu'},{email:'other@test.com',display_name:'Outra pessoa'}],tasks}}));
 await page.goto('/tarefas');
 const cards=page.locator('.task-kanban-card');
 await expect(cards).toHaveCount(3);
 const following=page.getByRole('button',{name:'Em acompanhamento',exact:true});
 const mine=page.getByRole('button',{name:'Minhas tarefas',exact:true});
 const followBox=(await following.boundingBox())!,mineBox=(await mine.boundingBox())!;
 expect(mineBox.x-followBox.x-followBox.width).toBeGreaterThanOrEqual(0);
 expect(mineBox.x-followBox.x-followBox.width).toBeLessThanOrEqual(16);
 await mine.click();await expect(cards).toHaveCount(1);await expect(cards).toContainText('Tarefa minha');
 await following.click();await expect(following).toHaveAttribute('aria-pressed','true');await expect(mine).toHaveAttribute('aria-pressed','false');
 await expect(cards).toHaveCount(1);await expect(cards).toContainText('Tarefa acompanhada');
 await following.click();await expect(cards).toHaveCount(3);
 await following.click();await mine.click();await expect(following).toHaveAttribute('aria-pressed','false');await expect(cards).toContainText('Tarefa minha');
});
