import {test,expect} from '@playwright/test';
test('schedule headers toggle ascending and descending order',async({page,context})=>{
 await context.addCookies([{name:'m8-access',value:'test',domain:'localhost',path:'/'}]);
 await page.route('**/api/activity',r=>r.fulfill({json:{admin:true}}));
 await page.route('**/api/service-scheduling',r=>r.fulfill({json:{users:[],schedules:[
 {id:'a',order_id:'10',company_id:2,cliente_nome:'Zulu',operation_count:10,equipamento:'Rotor',tipo_nome:'Preventiva',status_lancamento_nome:'Separado'},
 {id:'b',order_id:'2',company_id:1,cliente_nome:'Água',operation_count:2,equipamento:'Atlas',tipo_nome:'Corretiva',status_lancamento_nome:'Aberto'},
 ]}}));
 await page.goto('/programacao');
 await page.getByLabel('Mês da entrega prevista',{exact:true}).selectOption('');
 const rows=page.locator('.scheduling-orders-list tbody tr');
 for(const label of ['N° OS','Operações','Cliente','Equipamento','Tipo / atendimento','Status do lançamento','Empresa']){
  const header=page.getByRole('columnheader').filter({has:page.getByRole('button',{name:label,exact:true})});
  await header.getByRole('button').click();
  await expect(header).toHaveAttribute('aria-sort','ascending');
  await expect(rows.first()).toContainText('Água');
  await header.getByRole('button').click();
  await expect(header).toHaveAttribute('aria-sort','descending');
  await expect(rows.first()).toContainText('Zulu');
 }
});

test('completed OS summary follows ERP Processado rather than operation completion',async({page,context})=>{
 await context.addCookies([{name:'m8-access',value:'test',domain:'localhost',path:'/'}]);
 await page.route('**/api/activity',r=>r.fulfill({json:{admin:true}}));
 await page.route('**/api/service-scheduling',r=>r.fulfill({json:{users:[],schedules:[
 {id:'a',order_id:'10',order_status:'Processado',programming_status:'executing',operation_count:1,operation_status_counts:{executing:1}},
 {id:'b',order_id:'11',order_status:'Pendente',programming_status:'completed',operation_count:1,operation_status_counts:{completed:1}},
 {id:'c',order_id:'12',order_status:'Pendente',programming_status:'executing',operation_count:1,operation_status_counts:{executing:1}},
 ]}}));
 await page.goto('/programacao');
 await page.getByLabel('Mês da entrega prevista',{exact:true}).selectOption('');
 const flow=page.locator('.schedule-stage-flow');
 await expect(flow.locator('[data-status="completed"] strong')).toHaveText('1 OSs');
 await expect(flow.locator('[data-status="reviewed"] strong')).toHaveText('1 OSs');
 await expect(flow.locator('[data-status="executing"] strong')).toHaveText('1 OSs');
 await expect(flow.locator('[data-status="completed"] small')).toHaveText('1 operações');
 const badges=page.locator('.scheduling-orders-list .schedule-list-status');
 await expect(badges).toHaveText(['Revisada','Em Execução']);
 await page.getByRole('button',{name:/OSs concluídas/}).click();
 await expect(badges).toHaveText(['Revisada','Em Execução','Concluída']);
 await expect(badges.last()).toHaveClass(/completed/);
});
