import {test,expect} from '@playwright/test';
test('cancelled ERP orders are excluded from programming even with all months selected',async({page,context})=>{
 await context.addCookies([{name:'m8-access',value:'test',domain:'localhost',path:'/'}]);
 await page.route('**/api/activity',r=>r.fulfill({json:{}}));
 await page.route('**/api/service-scheduling',r=>r.fulfill({json:{users:[],schedules:[
 {id:'1',order_id:'15001',order_status:'Cancelado',cliente_nome:'Cliente cancelado',programming_status:'executing',operation_count:1},
 {id:'2',order_id:'15002',order_status:'Pendente',cliente_nome:'Cliente ativo',programming_status:'pending',operation_count:1}
 ]}}));
 await page.goto('/programacao');
 await page.getByLabel('Mês da entrega prevista',{exact:true}).selectOption('');
 await expect(page.locator('.scheduling-orders-list tbody tr')).toHaveCount(1);
 await expect(page.locator('.scheduling-orders-list')).toContainText('Cliente ativo');
 await expect(page.locator('.scheduling-orders-list')).not.toContainText('Cliente cancelado');
 await expect(page.locator('.schedule-overview-totals article').first().locator('strong')).toHaveText('1');
});
