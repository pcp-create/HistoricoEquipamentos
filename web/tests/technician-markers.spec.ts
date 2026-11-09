import { test, expect } from '@playwright/test';
test('colocated technicians remain individually clickable instead of opening a grouped list', async ({page,context})=>{
 await context.addCookies([{name:'m8-access',value:'test',domain:'localhost',path:'/'}]);
 await page.route('**/api/activity',r=>r.fulfill({json:{admin:false}}));
 await page.route('https://tile.openstreetmap.org/**',r=>r.abort());
 await page.route('**/api/field',r=>r.fulfill({json:{rows:[],calendarRows:[],active:null,email:'test',isTechnician:false}}));
 let refreshed=false;
 await page.route('**/api/field/map',r=>r.fulfill({json:{orders:[],technicians:['Guilherme Waltrick','Iago Rian'].map((name,i)=>({id:String(i),name,online:i===0&&!refreshed,latitude:-27,longitude:-49,located_at:new Date().toISOString(),source:'Apontamento',accuracy:10,pendingOrders:[]}))}}));
 await page.setViewportSize({width:390,height:844});
 await page.goto('/tecnico');
 await page.getByRole('button',{name:/^Programação/}).click();
 await page.getByRole('button',{name:'Mapa',exact:true}).click();
 const pins=page.locator('.field-person-icon');
 await page.locator('.field-map-cluster-icon').click();
 await expect(pins).toHaveCount(2);
 await expect(page.locator('.field-map-cluster-icon')).toHaveCount(0);
 await page.locator('.leaflet-control-zoom-in').click();
 await page.waitForTimeout(400);
 const surface=page.locator('.field-map-surface');
 const bounds=await surface.boundingBox();
 await page.mouse.move(bounds!.x+bounds!.width/2,bounds!.y+bounds!.height/2);
 await page.mouse.down();await page.mouse.move(bounds!.x+bounds!.width/2+45,bounds!.y+bounds!.height/2+25,{steps:8});await page.mouse.up();
 await page.waitForTimeout(500);
 const transform=await page.locator('.leaflet-map-pane').evaluate(el=>{(window as any).previousMapPane=el;return (el as HTMLElement).style.transform;});
 refreshed=true;
 await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/field/map')),page.evaluate(()=>window.dispatchEvent(new Event('rj-network-change')))]);
 await expect(page.locator('.field-person-marker.is-offline')).toHaveCount(2);
 await expect.poll(()=>page.locator('.leaflet-map-pane').evaluate(el=>el===(window as any).previousMapPane)).toBe(true);
 expect(await page.locator('.leaflet-map-pane').evaluate(el=>(el as HTMLElement).style.transform)).toBe(transform);
 const boxes=await pins.evaluateAll(elements=>elements.map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y}}));
 expect(Math.hypot(boxes[0].x-boxes[1].x,boxes[0].y-boxes[1].y)).toBeGreaterThanOrEqual(35);
 await pins.nth(0).click();
 await expect(page.locator('.leaflet-popup-content strong')).toHaveText('Guilherme Waltrick');
 await page.locator('.leaflet-popup-close-button').click();
 await expect(page.locator('.leaflet-popup-content')).toHaveCount(0);
 await pins.nth(1).click();
 await expect(page.locator('.leaflet-popup-content strong')).toHaveText('Iago Rian');
 await expect(page.locator('.field-cluster-list')).toHaveCount(0);
});

test('cluster clicks jump directly to successive partial groups and then open colocated names',async({page,context})=>{
 await context.addCookies([{name:'m8-access',value:'test',domain:'localhost',path:'/'}]);
 await page.route('**/api/activity',r=>r.fulfill({json:{admin:false}}));
 await page.route('https://tile.openstreetmap.org/**',r=>r.abort());
 await page.route('**/api/field',r=>r.fulfill({json:{rows:[],calendarRows:[],active:null,email:'test',isTechnician:false}}));
 const positions=[[-27,-49],[-27,-49],[-27,-48.99],[-27,-48.8],[-24,-44]];
 await page.route('**/api/field/map',r=>r.fulfill({json:{orders:[],technicians:positions.map(([latitude,longitude],i)=>({id:String(i),name:'Técnico '+i,online:true,latitude,longitude,accuracy:10,pendingOrders:[]}))}}));
 await page.setViewportSize({width:390,height:844});await page.goto('/tecnico');
 await page.getByRole('button',{name:/^Programação/}).click();await page.getByRole('button',{name:'Mapa',exact:true}).click();
 for(const size of ['4','3','2']){
  const group=page.locator('.field-map-cluster').filter({hasText:new RegExp('^'+size+'$')});
  await expect(group).toBeVisible();await group.click();
 }
 await expect(page.locator('.field-map-cluster-icon')).toHaveCount(0);
 await expect(page.locator('.field-person-name')).toHaveCount(5);
});
