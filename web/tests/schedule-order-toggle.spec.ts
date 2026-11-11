import {test,expect} from '@playwright/test';
test('observation button collapses and restores the draft without fetching or saving again',async({page,context})=>{
 await context.addCookies([{name:'m8-access',value:'test',domain:'localhost',path:'/'}]);
 await page.route('**/api/activity',r=>r.fulfill({json:{admin:true}}));
 const data={canEditSettings:true,email:'planner',settings:{document:{serviceTypes:[],checklists:[],calendars:[{id:'standard',name:'Padrão',week:[]}],vehicles:[]}},users:[],schedule:{id:'1',company_id:1,order_id:'100'},detail:{order:{numero_sequencia:'15001',cliente_nome:'Cliente'},materials:[],services:[]},operations:[],usage:[],costs:[],events:[],fieldSessions:[],fieldEvents:[],requests:[],profit:null};
 await page.route('**/api/service-scheduling**',r=>r.fulfill({json:data}));
 let reads=0,writes=0;
 await page.route('**/api/service-orders**',r=>{
  if(r.request().method()!=='GET'){writes++;return r.fulfill({json:{}});}
  reads++;
  return r.fulfill({json:new URL(r.request().url()).searchParams.has('edit')?{version:1,draft:{notes:'Observação original',internalNotes:'',flowStatus:'1'},labels:{flowStatus:'Aberta'}}:{rows:[]}});
 });
 await page.route('**/api/warehouse?**',r=>{reads++;return r.fulfill({json:{rows:[{id:'1',name:'Aberta'}]}});});
 await page.goto('/programacao?id=1');
 const toggle=page.getByRole('button',{name:'Editar observações e Status Fluxo',exact:true});
 await toggle.click();
 const notes=page.getByRole('textbox',{name:'Observação',exact:true});
 await expect(notes).toBeVisible();await notes.fill('Texto ainda não salvo');
 await expect(page.getByRole('region',{name:'Anexos da OS'})).toBeVisible();
 await expect(page.getByText('Nenhum anexo listado no ERP.',{exact:true})).toBeVisible();
 const before=reads;
 await toggle.click();
 await expect(toggle).toHaveAttribute('aria-expanded','false');await expect(notes).toBeHidden();
 await toggle.click();
 await expect(toggle).toHaveAttribute('aria-expanded','true');await expect(notes).toHaveValue('Texto ainda não salvo');
 expect(reads).toBe(before);expect(writes).toBe(0);
});
