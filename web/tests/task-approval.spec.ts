import {test,expect} from '@playwright/test';
test.setTimeout(90000);
test('approval drawer exposes description and decision only, requiring rejection reason',async({page,context})=>{
 await context.addCookies([{name:'m8-access',value:'test',domain:'localhost',path:'/'}]);
 let t:any={id:'42',task_type:'approval',approval_state:'pending',approval_description:'Autorizar compra do motor para a OS 15119.',title:'Compra de motor',status:'not_started',version:1,priority:'normal',source_key:'manual:42',assigned_to:'approver@test.com',created_by:'requester@test.com'};const writes:any[]=[];
 await page.route('**/api/tasks*',r=>{if(r.request().method()==='POST'){const b=r.request().postDataJSON();if(b.action==='approval_decide'){writes.push(b);t={...t,approval_state:b.decision,approval_reason:b.reason,approval_decided_at:'2026-10-23T12:00:00Z',assigned_to:'requester@test.com',version:2,status:'in_progress'}}return r.fulfill({json:{task:t,notes:[],attachments:[],notifications:[]}})}return r.fulfill({json:r.request().url().includes('id=')?{task:t,notes:[],attachments:[],notifications:[],canDecideApproval:t.approval_state==='pending',canCloseApproval:false}:{tasks:[t],users:[],email:'approver@test.com'}})});
 await page.goto('/tarefas?task=42');const dialog=page.getByRole('dialog');await expect(dialog.getByText(t.approval_description)).toBeVisible();await expect(dialog.getByText('Informações da tarefa',{exact:true})).toHaveCount(0);
 await dialog.getByRole('button',{name:'Reprovar',exact:true}).click();await expect(dialog.getByRole('button',{name:'Confirmar reprovação'})).toBeDisabled();await dialog.getByLabel('Justificativa da reprovação').fill('Revisar o orçamento.');await dialog.getByRole('button',{name:'Confirmar reprovação'}).click();
 await expect(dialog.getByText('Reprovada · Devolvida ao solicitante',{exact:true})).toBeVisible();expect(writes[0].reason).toBe('Revisar o orçamento.');
});
