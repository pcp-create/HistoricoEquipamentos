import {test,expect} from '@playwright/test';
import {blankOperation} from '../lib/service-scheduling/model';
test('programming warns for the selected equipment and excludes its own OS',async({page,context})=>{
 await context.addCookies([{name:'m8-access',value:'test',domain:'localhost',path:'/'}]);
 await page.route('**/api/activity',r=>r.fulfill({json:{admin:true}}));
 const data={canEditSettings:true,email:'planner',settings:{document:{serviceTypes:[],checklists:[],calendars:[{id:'standard',name:'Padrão',week:[]}],vehicles:[]}},users:[],schedule:{id:'1',company_id:1,order_id:'100'},detail:{order:{numero_sequencia:'15001',cliente_nome:'Cliente',produto_equipamento_id:'7'},materials:[],services:[]},operations:[{id:'op1',position:1,version:1,status:'scheduled',document:{...blankOperation(),equipmentId:'7'}}],usage:[],costs:[],events:[],fieldSessions:[],fieldEvents:[],requests:[],profit:null};
 await page.route('**/api/service-scheduling**',r=>r.fulfill({json:data}));
 await page.route('**/api/equipment/warranty?**',r=>{
  const params=new URL(r.request().url()).searchParams;
  expect(params.get('equipment')).toBe('7');expect(params.get('excludeCompany')).toBe('1');expect(params.get('excludeOrder')).toBe('100');
  return r.fulfill({json:{warranty:{company:'1',orderId:'90',number:'15000',startedAt:'2026-11-10',expiresAt:'2027-02-10',period:'3 meses',periodSource:'snapshot',lastOrder:{company:'1',orderId:'90',number:'15000',startedAt:'2026-11-10'}}}});
 });
 await page.goto('/programacao?id=1');
 const trigger=page.getByRole('button',{name:'Ver alerta de garantia do equipamento'});
 const popup=page.getByRole('dialog',{name:'Detalhes da garantia do equipamento'});
 await expect(trigger).toBeVisible();await expect(popup).toHaveCount(0);
 await trigger.click();await expect(popup).toBeVisible();
 const alert=page.getByRole('note',{name:'Alerta de garantia do equipamento'});
 await expect(alert).toContainText('OS 15000');await expect(alert).toContainText('10/02/2027');
 await expect(alert.getByRole('link').first()).toHaveAttribute('href','/historico?createdCompany=1&createdOrder=90');
 await page.getByRole('button',{name:'Fechar alerta de garantia'}).click();await expect(popup).toHaveCount(0);
 await expect(trigger).toBeFocused();await trigger.click();await expect(popup).toBeVisible();
 await page.setViewportSize({width:390,height:844});
 const bounds=await popup.boundingBox();expect(bounds!.x).toBeGreaterThanOrEqual(0);expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(390);
 await page.keyboard.press('Escape');await expect(popup).toHaveCount(0);
});
