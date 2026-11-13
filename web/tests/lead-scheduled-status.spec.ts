import {test,expect} from '@playwright/test';
test('scheduled lead is not shown as overdue',async({page,context})=>{
 await context.addCookies([{name:'m8-refresh',value:'test',domain:'localhost',path:'/'}]);
 await page.route('**/api/visits',r=>r.fulfill({json:{purposes:[],canManage:true,name:'Vendedor',customers:[{key:'lead:1',name:'Lead · Teste',city:'Timbó',uf:'SC',lead:true,in_portfolio:false,health:'overdue',lastVisit:null,equipment:[]}],visits:[{id:'1',contact:'Contato',phone:'',description:'',seller:'vendedor',customer_key:'lead:1',status:'scheduled',scheduled_at:'2026-12-01T12:00:00Z'}]}}));
 await page.goto('/visitas');
 await page.getByRole('button',{name:/Visitas Sua carteira/}).click();
 await page.getByRole('button',{name:'Lista',exact:true}).click();
 await page.getByRole('button',{name:'Leads (1)',exact:true}).click();
 const card=page.locator('.sales-customer').filter({hasText:'Lead · Teste'});
 await expect(card.locator('.sales-badge')).toHaveText('Agendada');
 await expect(card).not.toHaveClass(/overdue/);
});
