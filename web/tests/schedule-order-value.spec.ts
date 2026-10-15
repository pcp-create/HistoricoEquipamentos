import {test,expect} from '@playwright/test';
test('order values use BRL and sort numerically including cents and missing amounts',async({page,context})=>{
 await context.addCookies([{name:'m8-access',value:'test',domain:'localhost',path:'/'}]);
 await page.route('**/api/activity',r=>r.fulfill({json:{}}));
 await page.route('**/api/service-scheduling',r=>r.fulfill({json:{users:[],schedules:['2.90','2.10','0',null].map((value,i)=>({id:String(i),order_id:String(i+1),order_value:value,programming_status:'pending'}))}}));
 await page.goto('/programacao');
 await page.getByLabel('Mês da entrega prevista',{exact:true}).selectOption('');
 const cells=page.locator('.schedule-order-value');
 await expect(cells).toHaveText(['R$ 2,90','R$ 2,10','R$ 0,00','Não informado']);
 await page.getByRole('button',{name:'Valor da OS',exact:true}).click();
 await expect(cells).toHaveText(['R$ 0,00','R$ 2,10','R$ 2,90','Não informado']);
 await page.getByRole('button',{name:'Valor da OS',exact:true}).click();
 await expect(cells).toHaveText(['R$ 2,90','R$ 2,10','R$ 0,00','Não informado']);
});
