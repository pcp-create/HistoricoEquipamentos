import {test,expect} from '@playwright/test';
test('monthly week numbers, weekly services and detailed daily schedule respect executor filter',async({page,context})=>{
 await page.clock.setFixedTime(new Date('2026-10-15T12:00:00Z'));
 await context.addCookies([{name:'m8-access',value:'test',domain:'localhost',path:'/'}]);
 await page.route('**/api/activity',r=>r.fulfill({json:{admin:true}}));
 const schedules=[1,2].map(n=>({id:String(n),order_id:String(15000+n),cliente_nome:'Cliente '+n,equipamento:'Compressor '+n,customer_city:'Rio do Sul',customer_state:'SC',programming_status:'scheduled',operation_count:1,operation_status_counts:{scheduled:1},calendar_operations:[{
 id:'op'+n,position:1,status:'scheduled',description:'Manutenção '+n,internalNote:'Levar ferramentas',vehicleId:'van',
 responsible:n===1?'Ana':'Bruno',responsibleEmail:n===1?'ana@test':'bruno@test',support:n===1?['apoio@test']:[],date:'2026-10-15',time:n===1?'08:00':'09:00',
 dates:['2026-10-15','2026-10-16'],allocation:[{date:'2026-10-15',start:'2026-10-15T08:00:00-03:00',minutes:120},{date:'2026-10-16',start:'2026-10-16T07:30:00-03:00',minutes:60}]
 }]}));
 await page.route('**/api/service-scheduling',r=>r.fulfill({json:{schedules,users:[{email:'ana@test',display_name:'Ana'},{email:'bruno@test',display_name:'Bruno'},{email:'apoio@test',display_name:'Carlos'}],settings:{document:{vehicles:[{id:'van',name:'Van ABC123'}]}}}}));
 await page.goto('/programacao');
 await page.getByRole('button',{name:'Calendário',exact:true}).click();
 await expect(page.locator('.schedule-calendar-week-number')).toHaveCount(5);
 await expect(page.locator('.schedule-calendar-week-number').first()).toHaveText('40');
 await expect(page.locator('.schedule-calendar-order.scheduled').first()).toHaveCSS('background-color','rgb(255, 245, 204)');
 await expect(page.locator('.schedule-calendar-legend .scheduled')).toHaveCSS('background-color','rgb(229, 181, 43)');
 await expect(page.locator('.schedule-calendar-legend')).toHaveCSS('justify-content','flex-end');
 expect(await page.locator('.schedule-calendar-legend').evaluate(el=>el.getBoundingClientRect().top >= document.querySelector('.schedule-calendar-month')!.getBoundingClientRect().bottom)).toBe(true);
 await page.getByRole('button',{name:'Ver semana de 27/09/2026 a 03/10/2026',exact:true}).click();
 await expect(page.getByRole('button',{name:'Semana',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(page.getByRole('button',{name:'Ver programação de 27/09/2026',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Ver programação de 03/10/2026',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Hoje',exact:true}).click();
 await page.getByRole('button',{name:'Mês',exact:true}).click();
 await page.getByRole('button',{name:'Ver semana de 11/10/2026 a 17/10/2026',exact:true}).click();
 await expect(page.locator('.schedule-week-day')).toHaveCount(7);
 await expect(page.locator('.schedule-week-day').filter({has:page.getByRole('button',{name:'Ver programação de 15/10/2026',exact:true})}).locator('.schedule-calendar-order')).toHaveCount(2);
 await page.getByRole('button',{name:'Ver programação de 15/10/2026',exact:true}).click();
 await expect(page.locator('.schedule-daily-table tbody tr')).toHaveCount(2);
 const first=page.locator('.schedule-daily-table tbody tr').first();
 for(const text of ['Ana','Carlos','Manutenção 1','Levar ferramentas','Van ABC123','2 h neste dia']) await expect(first).toContainText(text);
 await page.getByRole('button',{name:'Próximo dia',exact:true}).click();
 await expect(first).toContainText('1 h neste dia');
 await expect(first).toContainText('07:30');
 await page.getByLabel('Executante',{exact:true}).selectOption('ana@test');
 await expect(page.locator('.schedule-daily-table tbody tr')).toHaveCount(1);
 await page.getByRole('button',{name:'Mês',exact:true}).click();
 await page.getByRole('button',{name:'Ver semana de 11/10/2026 a 17/10/2026',exact:true}).click();
 await expect(page.getByLabel('Executante',{exact:true})).toHaveValue('ana@test');
 await page.getByRole('button',{name:'Ver programação de 16/10/2026',exact:true}).click();
 await page.getByRole('button',{name:'Próximo dia',exact:true}).click();
 await expect(page.getByText('Nenhum serviço programado para este dia.')).toBeVisible();
 await page.getByRole('button',{name:'Hoje',exact:true}).click();
 await expect(first).toContainText('2 h neste dia');
 await page.setViewportSize({width:390,height:844});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('undated orders are highlighted beside totals and open from the list',async({page,context})=>{
 await context.addCookies([{name:'m8-access',value:'test',domain:'localhost',path:'/'}]);
 await page.route('**/api/activity',r=>r.fulfill({json:{admin:true}}));
 await page.route('**/api/service-scheduling',r=>r.fulfill({json:{users:[],schedules:[
 {id:'1',order_id:'15001',operation_count:1,calendar_operations:[{date:'',dates:[''],responsible:'Ana'}]},
 {id:'2',order_id:'15002',operation_count:0,calendar_operations:[]},
 {id:'3',order_id:'15003',operation_count:1,calendar_operations:[{date:'2026-10-15',dates:['2026-10-15']}]}
 ]}}));
 await page.goto('/programacao');
 const summary=page.locator('.schedule-overview-totals .schedule-undated-summary');
 await expect(summary).toHaveClass(/needs-attention/);
 await expect(summary.locator('strong')).toHaveText('2 OSs');
 await summary.getByRole('button').click();
 const dialog=page.getByRole('dialog',{name:'OSs do dia'});
 await expect(dialog.locator('.schedule-calendar-order')).toHaveCount(2);
 await expect(dialog).toContainText('OS 15001');
 await expect(dialog).toContainText('OS 15002');
 await dialog.getByRole('button',{name:'Fechar OSs do dia'}).click();
 await page.getByRole('button',{name:'Calendário',exact:true}).click();
 await expect(page.locator('.schedule-calendar-undated')).toHaveCount(0);
 await summary.getByRole('button').click();
 await expect(dialog).toBeVisible();
});
