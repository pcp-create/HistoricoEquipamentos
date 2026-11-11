import {test,expect} from '@playwright/test';
test('OS details load activity on demand, show names and changes, and load older records',async({page,context})=>{
 await context.addCookies([{name:'m8-access',value:'test',domain:'localhost',path:'/'}]);
 await page.route('**/api/**',r=>r.fulfill({json:{rows:[],tasks:[],users:[]}}));
 await page.route('**/api/activity',r=>r.fulfill({json:{admin:true}}));
 const data={canEditSettings:true,email:'planner',settings:{document:{serviceTypes:[],checklists:[],calendars:[],vehicles:[]}},users:[],schedule:{id:'1',company_id:1,order_id:'100'},detail:{order:{numero_sequencia:'15001',cliente_nome:'Cliente'},materials:[],services:[]},operations:[],usage:[],costs:[],events:[],fieldSessions:[],fieldEvents:[],requests:[],profit:null};
 await page.route('**/api/service-scheduling**',r=>r.fulfill({json:data}));
 await page.route('**/api/service-orders?**',r=>r.fulfill({json:{rows:[]}}));
 await page.route('**/api/orders/1/100',r=>r.fulfill({json:{...data.detail,equipment:[],equipment_links:[]}}));
 let reads=0;
 await page.route('**/api/service-orders/activity?**',r=>{
  reads++;const p=new URL(r.request().url()).searchParams;
  expect(p.get('company')).toBe('1');expect(p.get('order')).toBe('100');
  return r.fulfill({json:{rows:[{id:'audit:'+reads,at:'2026-11-11T15:00:00Z',actor:'planner@test',author:'Nome do Planejador',action:p.get('page')==='0'?'service_operation_operation':'service_operation_created',position:1,details:{before:{document:{description:'Descrição anterior'}},after:{document:{description:'Descrição corrigida'}}}}],hasMore:p.get('page')==='0'}});
 });
 await page.goto('/programacao?id=1');await page.getByText('Ver detalhes da OS',{exact:true}).click();
 const activity=page.locator('.order-activity');await expect(activity).toBeVisible();expect(reads).toBe(0);
 await activity.locator('summary').first().click();
 await expect(activity).toContainText('Nome do Planejador');await expect(activity).toContainText('Operação 01');
 await activity.getByText('Ver detalhes da ação',{exact:true}).click();
 await expect(activity.getByRole('columnheader',{name:'Antes',exact:true})).toBeVisible();
 await expect(activity.getByText('Descrição anterior',{exact:true})).toBeVisible();await expect(activity.getByText('Descrição corrigida',{exact:true})).toBeVisible();
 await activity.getByRole('button',{name:'Carregar mais registros'}).click();
 await expect(activity).toContainText('Operação criada na programação');expect(reads).toBe(2);
});
