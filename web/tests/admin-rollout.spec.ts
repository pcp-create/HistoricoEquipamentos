import {test,expect} from '@playwright/test';
test.skip(!process.env.M8_ROLLOUT_TESTS,'Requires isolated auth fixture or dedicated admin/user test sessions.');
for(const admin of [false,true])test(`${admin?'administrator sees preview':'ordinary user keeps published interface and cannot access preview APIs'}`,async({page,context})=>{
 await context.addCookies([{name:'m8-access',value:admin?(process.env.M8_TEST_ADMIN_TOKEN||'preview-admin'):(process.env.M8_TEST_USER_TOKEN||'preview-user'),domain:'localhost',path:'/'}]);
 await page.route('**/api/activity',r=>r.fulfill({json:{admin}}));
 await page.goto('/modulos/assistencia-tecnica');
 const portal=page.getByRole('link',{name:'Portal do técnico',exact:true});
 if(admin){await expect(portal).toBeVisible();await expect(page.getByRole('link',{name:'Programação de OSs',exact:true})).toBeVisible();await expect(page.locator('body')).toHaveClass('admin-preview');}
 else{
  await expect(portal).toHaveCount(0);await expect(page.getByRole('link',{name:'Programação de OSs',exact:true})).toHaveCount(0);
  await expect(page.locator('body')).not.toHaveClass('admin-preview');
  for(const url of ['/api/field','/api/service-scheduling','/api/service-scheduling/checklist-pdf?operationId=invalid','/api/service-scheduling/photos/1','/api/orders/1/14849/link'])expect((await context.request.get(url)).status(),url).toBe(403);
  for(const url of ['/api/field','/api/service-scheduling','/api/service-scheduling/photos','/api/orders/1/14849/link'])expect((await context.request.post(url,{headers:{origin:new URL(page.url()).origin},data:{}})).status(),url).toBe(403);
  await page.goto('/tecnico');await expect(page).toHaveURL(/\/$/);
  await page.goto('/programacao');await expect(page).toHaveURL(/\/$/);
 }
});
