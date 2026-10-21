import {test,expect} from '@playwright/test';
test('history shows only pending tasks linked to each order and company',async({page,context})=>{
 await context.addCookies([{name:'m8-access',value:'test',domain:'localhost',path:'/'}]);
 await page.route('**/api/activity',r=>r.fulfill({json:{admin:true}}));
 await page.route('**/api/history?*',r=>r.fulfill({json:new URL(r.request().url()).searchParams.has('overview')?{orders:1,materials:0,clients:1,imported:1,statuses:[]}:{rows:[{company_id:1,id:'635',number:'15070',client:'Cliente teste',materials:0}],total:1,page:1,pageSize:50}}));
 await page.route('**/api/tasks',r=>r.fulfill({json:{tasks:[
  {id:'101',order_company:1,order_id:'635',status:'not_started'},
  {id:'102',order_company:1,order_id:'635',status:'in_progress'},
  {id:'103',order_company:1,order_id:'635',status:'completed'},
  {id:'104',order_company:2,order_id:'635',status:'not_started'},
  {id:'105',order_company:1,order_id:'636',status:'not_started'},
 ],users:[]}}));
 await page.goto('/historico');
 await expect(page.getByRole('columnheader',{name:'Tarefas pendentes'})).toBeVisible();
 await expect(page.getByRole('link',{name:/TAR-101/})).toBeVisible();
 await expect(page.getByRole('link',{name:/TAR-102/})).toBeVisible();
 for(const id of ['103','104','105'])await expect(page.getByRole('link',{name:new RegExp('TAR-'+id)})).toHaveCount(0);
});
