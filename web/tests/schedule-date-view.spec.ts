import {test,expect} from '@playwright/test';
test('date view is shared by list calendar and map and calendar navigation updates the scheduled month',async({page,context})=>{
 await page.clock.setFixedTime(new Date('2026-10-19T12:00:00Z'));
 await context.addCookies([{name:'m8-access',value:'test',domain:'localhost',path:'/'}]);
 await page.route('**/api/activity',r=>r.fulfill({json:{admin:true}}));
 const schedules=[
  {id:'1',order_id:'15001',cliente_nome:'Entrega anterior',expected_delivery_date:'2026-09-01',calendar_operations:[{id:'a',date:'2026-11-02',time:'08:00',status:'scheduled',position:1,responsibleEmail:'ana',responsible:'Ana'}]},
  {id:'2',order_id:'15002',cliente_nome:'Entrega futura',expected_delivery_date:'2026-12-01',calendar_operations:[{id:'b',date:'2026-10-20',time:'08:00',status:'scheduled',position:1,responsibleEmail:'ana',responsible:'Ana'}]},
 ].map(s=>({...s,programming_status:'scheduled',operation_count:1,operation_status_counts:{scheduled:1}}));
 await page.route('**/api/service-scheduling',r=>r.fulfill({json:{schedules,users:[{email:'ana',display_name:'Ana'}],settings:{document:{vehicles:[]}}}}));
 await page.route('**/api/service-scheduling/map**',r=>r.fulfill({json:{schedules:[],territories:[],sellers:[]}}));
 await page.goto('/programacao');const list=page.locator('.scheduling-orders-list');
 await expect(list).toContainText('Entrega anterior');await expect(list).not.toContainText('Entrega futura');
 await page.getByLabel('Visão por data',{exact:true}).selectOption('operation');
 await expect(list).toContainText('Entrega futura');await expect(list).not.toContainText('Entrega anterior');
 await expect(page.getByLabel('Mês da operação programada')).toHaveValue('10');
 await page.getByRole('button',{name:'Calendário',exact:true}).click();
 await expect(page.locator('.schedule-calendar-order')).toContainText(['OS 15002']);
 await page.getByRole('button',{name:'Ver semana de 27/09/2026 a 03/10/2026',exact:true}).click();
 await expect(page.getByLabel('Mês da operação programada')).toHaveValue('10');
 await page.getByRole('button',{name:'Mês',exact:true}).click();
 await page.getByLabel('Mês da operação programada').selectOption('11');
 await expect(page.locator('.schedule-calendar-order')).toContainText(['OS 15001']);
 await page.getByRole('button',{name:'Hoje',exact:true}).click();
 await expect(page.getByLabel('Mês da operação programada')).toHaveValue('10');
 await page.getByRole('button',{name:'Mapa',exact:true}).click();
 await expect(page.locator('.schedule-map-summary-total strong')).toHaveText('1');
 await expect(page.locator('.schedule-map-list')).toContainText('Entrega futura');
 await expect(page.locator('.schedule-map-list')).not.toContainText('Entrega anterior');
 await page.getByLabel('Visão por data',{exact:true}).selectOption('delivery');
 await expect(page.locator('.schedule-map-list')).toContainText('Entrega anterior');
});
