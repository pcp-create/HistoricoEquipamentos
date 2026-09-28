import {test,expect} from '@playwright/test';
test('stage tab supports inline CRUD and rolls back a rejected removal',async({page,context,request})=>{
 expect((await request.get('/api/task-stages')).status()).toBe(401);
 expect((await request.post('/api/task-stages',{data:{}})).status()).toBe(403);
 await context.addCookies([{name:'m8-access',value:'test',domain:'localhost',path:'/'}]);
 await page.route('**/api/activity',r=>r.fulfill({json:{admin:true}}));
 await page.route('**/api/tasks',r=>r.fulfill({json:{tasks:[],users:[]}}));
 await page.route('**/api/task-settings',r=>r.fulfill({json:{canEdit:true,rules:[],users:[]}}));
 let rows:any[]=[],reject=false;
 await page.route('**/api/task-stages',async r=>{
 if(r.request().method()==='GET')return r.fulfill({json:{canEdit:true,stages:rows,roles:['Comercial']}});
 const b=r.request().postDataJSON();
 if(reject)return r.fulfill({status:400,json:{error:'Falha ao remover'}});
 const stage={...b,id:b.id||'66528857-e7f3-471f-969f-04d04c5f0501',version:(b.version||0)+1};
 rows=b.action==='delete'?[]:[stage];return r.fulfill({json:{stage:b.action==='delete'?null:stage}});
 });
 await page.goto('/tarefas');await page.getByRole('button',{name:'Configurações de Tarefas',exact:true}).click();
 await page.getByRole('button',{name:'Etapas da tarefa',exact:true}).click();
 await page.getByRole('button',{name:'Adicionar etapa',exact:true}).click();
 await page.getByLabel('Cargo da nova etapa').fill('Comercial');await page.getByLabel('Nome da nova etapa').fill('Contato');await expect(page.getByLabel('Ordem da nova etapa')).toHaveValue('1');
 await expect(page.getByRole('button',{name:/Salvar etapa/})).toHaveCount(0);
 await expect(page.getByLabel('Nome da etapa Contato')).toHaveValue('Contato');
 await page.getByLabel('Nome da etapa Contato').fill('Proposta');
 await expect(page.getByLabel('Nome da etapa Proposta')).toHaveValue('Proposta');
 await expect(page.locator('.task-stage-group > header')).toContainText('Comercial');
 await page.getByRole('button',{name:'Adicionar etapa',exact:true}).click();
 await expect(page.getByLabel('Cargo da nova etapa')).toHaveValue('Comercial');
 await expect(page.getByLabel('Ordem da nova etapa')).toHaveValue('2');
 await page.getByRole('button',{name:'Cancelar',exact:true}).click();
 reject=true;await page.getByRole('button',{name:'Remover etapa Proposta',exact:true}).click();
 await expect(page.locator('.task-stages').getByRole('alert')).toHaveText('Falha ao remover');await expect(page.getByLabel('Nome da etapa Proposta')).toBeVisible();
 await page.setViewportSize({width:390,height:844});
 expect(await page.locator('.task-stages').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
 reject=false;await page.getByRole('button',{name:'Remover etapa Proposta',exact:true}).click();await expect(page.getByText('Nenhuma etapa cadastrada.')).toBeVisible();
});

test('dragging the seventh stage to fifth renumbers the group',async({page,context})=>{
 await context.addCookies([{name:'m8-access',value:'test',domain:'localhost',path:'/'}]);
 await page.route('**/api/activity',r=>r.fulfill({json:{admin:true}}));
 await page.route('**/api/tasks',r=>r.fulfill({json:{tasks:[],users:[]}}));
 await page.route('**/api/task-settings',r=>r.fulfill({json:{canEdit:true,rules:[],users:[]}}));
 let rows=Array.from({length:7},(_,i)=>({id:String(i+1),name:'Etapa '+(i+1),sort_order:i+1,job_title:'Comercial',version:1}));
 await page.route('**/api/task-stages',r=>{
 if(r.request().method()==='GET')return r.fulfill({json:{canEdit:true,stages:rows,roles:[]}});
 const body=r.request().postDataJSON();rows=body.stages.map((s:any,i:number)=>({...rows.find(r=>r.id===s.id)!,sort_order:i+1,version:2}));return r.fulfill({json:{stages:rows}});
 });
 await page.goto('/tarefas');await page.getByRole('button',{name:'Configurações de Tarefas',exact:true}).click();await page.getByRole('button',{name:'Etapas da tarefa',exact:true}).click();
 await expect(page.getByLabel('Ordem da etapa Etapa 7')).toHaveAttribute('readonly','');
 await page.getByRole('button',{name:'Arrastar etapa Etapa 7',exact:true}).dragTo(page.locator('tr[data-stage-id="5"]'));
 await expect(page.getByLabel('Ordem da etapa Etapa 7')).toHaveValue('5');
 await expect(page.getByLabel('Ordem da etapa Etapa 5')).toHaveValue('6');
 await expect(page.getByLabel('Ordem da etapa Etapa 6')).toHaveValue('7');
 await page.getByRole('button',{name:'Subir etapa Etapa 7',exact:true}).click();
 await expect(page.getByLabel('Ordem da etapa Etapa 7')).toHaveValue('4');
});
