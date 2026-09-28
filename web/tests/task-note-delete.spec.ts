import {test,expect} from '@playwright/test';
test('administrators can remove notes with confirmation and failed requests restore the note',async({page,context})=>{
 await context.addCookies([{name:'m8-access',value:'test',domain:'localhost',path:'/'}]);
 const task={id:'1',title:'Teste',source_key:'manual:1',status:'in_progress',priority:'normal'};
 let notes=[{id:'10',title:'Tratativa',description:'Texto',created_name:'Ana'}],reject=true,admin=true;
 const detail=()=>({task,notes,attachments:[],notifications:[],canDeleteNotes:admin});
 await page.route('**/api/activity',r=>r.fulfill({json:{}}));await page.route('**/api/task-stages',r=>r.fulfill({json:{stages:[]}}));await page.route('**/api/tasks/reminders**',r=>r.fulfill({json:{reminders:[]}}));
 await page.route('**/api/tasks?id=1',r=>r.fulfill({json:detail()}));await page.route('**/api/tasks',r=>{if(r.request().method()==='POST'){const b=r.request().postDataJSON();if(b.action==='delete_note'){if(reject)return r.fulfill({status:503,json:{error:'Falha ao excluir'}});notes=[];return r.fulfill({json:detail()});}return r.fulfill({json:{}});}return r.fulfill({json:{tasks:[task],users:[]}});});
 await page.goto('/tarefas?task=1');const button=page.getByRole('button',{name:'Excluir nota: Tratativa',exact:true});await expect(button).toBeVisible();
 page.once('dialog',d=>d.dismiss());await button.click();await expect(button).toBeVisible();
 page.once('dialog',d=>d.accept());await button.click();await expect(page.locator('.task-drawer').getByRole('alert')).toContainText('Falha ao excluir');await expect(button).toBeVisible();
 reject=false;page.once('dialog',d=>d.accept());await button.click();await expect(page.getByRole('heading',{name:'Notas (0)',exact:true})).toBeVisible();
 admin=false;notes=[{id:'10',title:'Tratativa',description:'Texto',created_name:'Ana'}];await page.reload();await expect(page.getByRole('heading',{name:'Notas (1)',exact:true})).toBeVisible();await expect(button).toHaveCount(0);
});
