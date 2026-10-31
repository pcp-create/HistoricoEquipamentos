import {test,expect} from '@playwright/test';
test('mobile workshop actions stay at the bottom while machine details scroll',async({page,context})=>{
 await context.addCookies([{name:'m8-access',value:'test',domain:'localhost',path:'/'}]);
 const visit={id:'10000000-0000-4000-8000-000000000001',equipment_id:'21718',name:'ZZ - COMPRESSOR PARAFUSO 60HP - 275PCM - GA 45FF NEW - 8,5BAR - 380V/60HZ - SÉRIE BQD101925',client:'Frota própria',serial:'BQD101925',workshop_id:'1',workshop:'RJ Compressores',entered_at:'2025-08-20T12:00:00Z',stage:'received',effective_stage:'received',version:1,orders:[],tasks:[],quotes:[],drafts:[],external:[],events:[],notes:'Observação da máquina.\n'.repeat(50)};
 await page.route('**/api/**',r=>r.fulfill({json:{}}));
 await page.route('**/api/workshop',r=>r.fulfill({json:{workshops:[{id:'1',name:'RJ Compressores',active:true}],visits:[visit],external:[]}}));
 await page.setViewportSize({width:390,height:844});await page.goto('/oficina');
 await page.getByRole('button',{name:'Abrir 21718',exact:true}).click();
 const drawer=page.getByRole('dialog',{name:'Ficha da máquina'}),footer=drawer.locator('.ws-drawer-footer');
 for(const size of [{width:390,height:844},{width:320,height:640}]){
  await page.setViewportSize(size);
  await expect(footer.getByRole('button')).toHaveCount(3);
  await expect(footer.getByRole('button',{name:'Conserto externo',exact:true})).toHaveCount(0);
  const boxes=await Promise.all((await footer.getByRole('button').all()).map(button=>button.boundingBox()));
  expect(boxes.every(box=>box&&Math.abs(box.y-boxes[0]!.y)<1)).toBe(true);
  const before=(await footer.boundingBox())!;
  expect(Math.abs(before.y+before.height-size.height)).toBeLessThanOrEqual(1);
  for(const button of await footer.getByRole('button').all()){
   await expect(button).toBeInViewport();const box=(await button.boundingBox())!;
   expect(box.height).toBeGreaterThanOrEqual(44);expect(box.height).toBeLessThan(70);
   expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(size.width);
  }
  const body=drawer.locator('.ws-detail-body');
  await body.evaluate(el=>{el.scrollTop=el.scrollHeight;});
  const after=(await footer.boundingBox())!;expect(after.y).toBe(before.y);
  expect(await body.evaluate(el=>el.scrollTop)).toBeGreaterThan(0);
  expect(await drawer.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
 }
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/tmp/workshop-mobile-actions.png'});
 await footer.getByRole('button',{name:'Transferir equipamento',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'Transferir equipamento entre oficinas'})).toBeVisible();
});
