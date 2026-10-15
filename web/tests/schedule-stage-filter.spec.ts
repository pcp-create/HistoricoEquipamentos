import {test,expect} from '@playwright/test';
test('stage cards filter the list, retain totals and expand completed OSs',async({page,context})=>{
 await context.addCookies([{name:'m8-access',value:'test',domain:'localhost',path:'/'}]);
 await page.route('**/api/activity',r=>r.fulfill({json:{}}));
 await page.route('**/api/service-scheduling',r=>r.fulfill({json:{users:[],schedules:[
 {id:'1',order_id:'15001',cliente_nome:'Pendente teste',programming_status:'pending'},
 {id:'2',order_id:'15002',cliente_nome:'Execução teste',programming_status:'executing'},
 {id:'3',order_id:'15003',cliente_nome:'Concluída teste',programming_status:'pending',order_status:'Processado'}
 ]}}));
 await page.goto('/programacao');
 await page.getByLabel('Mês da entrega prevista',{exact:true}).selectOption('');
 const list=page.locator('.scheduling-orders-list');
 const pending=page.getByRole('button',{name:'Filtrar OSs: Pendente',exact:true});
 await pending.click();
 await expect(pending).toHaveAttribute('aria-pressed','true');
 await expect(list).toContainText('Pendente teste');await expect(list).not.toContainText('Execução teste');
 await expect(page.locator('.schedule-overview-totals article').first().locator('strong')).toHaveText('3');
 await pending.click();await expect(list).toContainText('Execução teste');
 await page.getByRole('button',{name:'Filtrar OSs: Concluída',exact:true}).click();
 await expect(list).toContainText('Concluída teste');await expect(list).not.toContainText('Pendente teste');
 await page.getByRole('button',{name:'Filtrar OSs: Em planejamento',exact:true}).click();
 await expect(list).toContainText('Nenhuma OS encontrada');
 await page.getByRole('button',{name:'Limpar etapa',exact:true}).click();
 await expect(list).toContainText('Pendente teste');
});
