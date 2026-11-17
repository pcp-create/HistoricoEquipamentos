import {test,expect} from '@playwright/test';
test('pending contacts can be corrected individually and reconciled',async({page,context})=>{
 await context.addCookies([{name:'m8-refresh',value:'test',domain:'localhost',path:'/'}]);
 let row:any={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',customer_key:'m8:10',customer_name:'Cliente A',name:'Alex',phone:'49999110530',email:'',job_version:1,cargo_id:7,job_title:'Manutenção',sync_requested:true,sync_error:'O M8 exige e-mail.'};
 let retries=0;
 await page.route('**/api/activity',r=>r.fulfill({json:{admin:true}}));
 await page.route('**/api/contact-sync',r=>{if(r.request().method()==='POST'){retries++;return r.fulfill({json:{queued:true}});}return r.fulfill({json:{rows:[row]}});});
 await page.route('**/api/contact-job-types',r=>r.fulfill({json:{rows:[{id:'1',name:'Manutenção',m8_id:7}]}}));
 await page.route('**/api/customer-contacts',r=>{const b=r.request().postDataJSON();expect(b.email).toBe('alex@example.com');row={...row,...b,job_version:2};return r.fulfill({json:{contact:row}});});
 await page.goto('/configuracoes/cadastros/sincronismos');
 await expect(page.getByText('O M8 exige e-mail.')).toBeVisible();
 await page.getByRole('button',{name:'Corrigir contato'}).click();
 await page.getByLabel('E-mail do contato',{exact:true}).fill('alex@example.com');
 await page.getByRole('button',{name:'Salvar contato',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'Editar contato'})).toHaveCount(0);
 await expect(page.locator('article')).toContainText('alex@example.com');
 await page.getByRole('button',{name:'Tentar sincronizar'}).click();
 await expect.poll(()=>retries).toBe(1);
});
