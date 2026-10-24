import {test,expect} from '@playwright/test';
test('history resolves missing statuses, opens schedules and includes unscheduled orders',async({page,context})=>{
 await context.addCookies([{name:'m8-refresh',value:'test',domain:'localhost',path:'/'}]);
 await page.route('**/api/tasks*',r=>r.fulfill({json:{tasks:[],users:[],settings:{},canManage:false}}));
 await page.route('**/api/history*',r=>r.fulfill({json:r.request().url().includes('overview')?{orders:2,materials:0,clients:1,statuses:[]}:{rows:[
  {company_id:1,id:'15101',number:'15101',status:'Cancelado',client:'Cliente',programming_id:'636',programming_status:'cancelled',programming_label:'Cancelado'},
  {company_id:1,id:'15070',number:'15070',status:'Pendente',client:'Cliente',},
  {company_id:1,id:'15100',number:'15100',status:'Pendente',client:'Cliente'}
 ],total:2,page:1,size:25,view:'orders'}}));
 await page.route('**/api/service-scheduling?*',r=>r.fulfill({json:{programming:new URL(r.request().url()).searchParams.get('orderId')==='15070'?{id:'635',status:'reviewed',label:'Revisada'}:{status:'none',label:'Sem programação'}}}));
 let write:any;
 await page.route('**/api/service-scheduling',r=>{write=r.request().postDataJSON();return r.fulfill({json:{schedule:{id:'999'}}})});
 await page.route('**/programacao?id=999',r=>r.fulfill({contentType:'text/html',body:'<h1>Programação aberta</h1>'}));
 await page.goto('/historico');
 await expect(page.locator('.history-programming-action.cancelled')).toHaveText('OS cancelada');
 await expect(page.locator('a[href="/programacao?id=636"]')).toHaveCount(0);
 const reviewed=page.getByRole('link',{name:'Abrir programação: Revisada',exact:true});await expect(reviewed).toHaveAttribute('href','/programacao?id=635');
 const styles=await reviewed.evaluate(e=>{const os=e.parentElement!.querySelector('.badge')!;const a=getComputedStyle(e),b=getComputedStyle(os);return {sameFont:a.fontSize===b.fontSize&&a.fontWeight===b.fontWeight,sameLeft:Math.abs(e.getBoundingClientRect().left-os.getBoundingClientRect().left)<1}});
 expect(styles).toEqual({sameFont:true,sameLeft:true});
 await page.getByRole('button',{name:'Programar',exact:true}).click();
 await expect(page).toHaveURL(/programacao\?id=999/);expect(write).toEqual({action:'include',company:1,orderId:'15100'});
});
