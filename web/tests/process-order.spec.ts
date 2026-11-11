import {test,expect} from '@playwright/test';
import {blankOperation} from '../lib/service-scheduling/model';
for(const reviewed of [false,true,"empty"])test(`process button ${reviewed==='empty'?'without operations ':''}${reviewed?'confirms both ERP steps':'explains pending reviews'}`,async({page,context})=>{
 await context.addCookies([{name:'m8-access',value:'test',domain:'localhost',path:'/'}]);
 await page.route('**/api/activity',r=>r.fulfill({json:{admin:true}}));
 const data={canEditSettings:true,email:'planner',settings:{document:{serviceTypes:[],checklists:[],calendars:[{id:'standard',name:'Padrão',week:[]}],vehicles:[]}},users:[],schedule:{id:'1',company_id:1,order_id:'100'},detail:{order:{status:'Pendente',numero_sequencia:'15001',cliente_nome:'Cliente'},materials:[],services:[]},operations:reviewed==='empty'?[]:[{id:'op1',position:1,version:1,status:reviewed?'reviewed':'scheduled',document:blankOperation()}],usage:[],costs:[],events:[],fieldSessions:[],fieldEvents:[],requests:[],profit:null};
 await page.route('**/api/service-scheduling**',r=>r.fulfill({json:data}));
 let writes=0;const ids:string[]=[];
 await page.route('**/api/service-scheduling/process-order',r=>{
  writes++;ids.push(r.request().postDataJSON().id);
  return r.fulfill({json:{id:ids[0],state:writes===1?'ready':'complete',nextStep:writes}});
 });
 await page.goto('/programacao?id=1');
 const button=page.getByRole('button',{name:'Processar OS',exact:true});
 if(!reviewed){
  await expect(button).toBeDisabled();
  const originalBounds=await button.boundingBox();
  await button.locator('..').hover();
  await expect(page.getByRole('tooltip')).toBeVisible();
  expect(await button.boundingBox()).toEqual(originalBounds);
  await expect(page.getByRole('button',{name:'Revisar operações',exact:true})).toBeVisible();
  await expect(page.getByRole('tooltip')).toContainText('1 operação(ões) ainda não revisada(s)');
  await expect(button).toBeVisible();
  await page.mouse.move(0,0);await expect(page.getByRole('tooltip')).toHaveCount(0);
  await expect(button).toHaveCSS('background-color','rgb(232, 237, 241)');
  expect(writes).toBe(0);
 }else{
  await expect(button).toBeEnabled();
  await expect(button).toHaveCSS('background-color','rgb(35, 128, 75)');
  page.once('dialog',dialog=>{expect(dialog.message()).toContain('19 - OS Faturada');void dialog.accept();});
  await button.click();
  await expect(page.getByRole('status').filter({hasText:'OS processada no M8'})).toBeVisible();
  await expect(button).toBeDisabled();expect(writes).toBe(2);expect(ids[0]).toBe(ids[1]);
 }
});
