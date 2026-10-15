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
