import {test,expect} from '@playwright/test';
test('delivery month filters list and map while completed orders stay grouped last',async({page,context})=>{
 await page.clock.setFixedTime(new Date('2026-11-01T01:00:00Z')); // Still October in Brasília.
 await context.addCookies([{name:'m8-access',value:'test',domain:'localhost',path:'/'}]);
 await page.route('**/api/activity',r=>r.fulfill({json:{admin:true}}));
 await page.route('**/api/service-scheduling',r=>r.fulfill({json:{users:[],schedules:[
 {id:'1',order_id:'15001',cliente_nome:'Concluído outubro',order_status:'Processado',programming_status:'completed',expected_delivery_date:'2026-10-31'},
 {id:'2',order_id:'15002',cliente_nome:'Aberto outubro',programming_status:'pending',expected_delivery_date:'2026-10-01'},
 {id:'3',order_id:'15003',cliente_nome:'Aberto novembro',programming_status:'pending',expected_delivery_date:'2026-11-01'},
 {id:'4',order_id:'15004',cliente_nome:'Sem entrega',programming_status:'pending',expected_delivery_date:null},
 {id:'5',order_id:'15005',cliente_nome:'Pendente ano anterior',programming_status:'pending',expected_delivery_date:'2025-12-10'},
 {id:'6',order_id:'15006',cliente_nome:'Concluído setembro',order_status:'Processado',programming_status:'completed',expected_delivery_date:'2026-09-10'}
 ]}}));
 await page.route('**/api/service-scheduling/map**',r=>r.fulfill({json:{schedules:[],territories:[],sellers:[]}}));
 await page.goto('/programacao');
 const list=page.locator('.scheduling-orders-list');
 await expect(page.getByLabel('Mês da entrega prevista',{exact:true})).toHaveValue('10');
 await expect(page.getByLabel('Ano da entrega prevista',{exact:true})).toHaveValue('2026');
 await expect(list).not.toContainText('Aberto novembro');
 await expect(list).not.toContainText('Concluído outubro');
 await page.getByLabel('Ano da entrega prevista',{exact:true}).selectOption('2026');
 await page.getByLabel('Mês da entrega prevista',{exact:true}).selectOption('10');
 await expect(list).toContainText('Aberto outubro');
 await expect(list).not.toContainText('Aberto novembro');
 await expect(list).not.toContainText('Sem entrega');
 await expect(list).toContainText('01/10/2026');
 await expect(list).toContainText('Pendente ano anterior');
 await expect(list).not.toContainText('Concluído setembro');
 const lateDate=list.locator('td.schedule-delivery-carried');
 await expect(lateDate).toHaveText('10/12/2025');
 await expect(lateDate).toHaveCSS('color','rgb(180, 35, 24)');
 await expect(lateDate).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
 await list.getByRole('button',{name:/OSs concluídas/}).click();
 await expect(list.locator('tbody tr').last()).toContainText('Concluído outubro');
 await page.getByRole('button',{name:'Mapa',exact:true}).click();
 await expect(page.getByLabel('Mês da entrega prevista',{exact:true})).toHaveValue('10');
 await expect(page.locator('.schedule-map-summary-total strong')).toHaveText('3');
 await page.locator('.schedule-map-status-filters').getByRole('button',{name:/Concluída/}).click();
 await expect(page.locator('.schedule-map-status-filters').getByRole('button',{name:/Concluída/})).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('.schedule-map-list')).toContainText('Concluído outubro');
 await expect(page.locator('.schedule-map-list')).not.toContainText('Aberto outubro');
 await page.locator('.schedule-map-summary-total').click();
 await page.getByLabel('Mês da entrega prevista',{exact:true}).selectOption('11');
 await expect(page.locator('.schedule-map-summary-total strong')).toHaveText('3');
 await page.getByRole('button',{name:'Lista',exact:true}).click();
 await page.getByLabel('Mês da entrega prevista',{exact:true}).selectOption('');
 await expect(list).toContainText('Aberto novembro');
 await expect(list).toContainText('Sem entrega');
});
