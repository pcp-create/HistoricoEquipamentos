import {test,expect} from '@playwright/test';
import {blankOperation} from '../lib/service-scheduling/model';
test('partial operation shows status with details only on hover or keyboard focus',async({page,context})=>{
 await context.addCookies([{name:'m8-access',value:'test',domain:'localhost',path:'/'}]);
 await page.route('**/api/activity',r=>r.fulfill({json:{admin:true}}));
 await page.route('**/api/tasks?**',r=>r.fulfill({json:{tasks:[]}}));
 const operation={id:'10000000-0000-4000-8000-000000000001',version:1,position:1,status:'executing',document:{...blankOperation(),description:'Atendimento',responsible:'main',support:['support'],requireTechnicianClosure:true,technicianClosures:{main:{at:'2026-11-13T12:00:00Z'}},checklistRun:{submission:{by:'main'}}}};
 await page.route('**/api/service-scheduling**',r=>r.fulfill({json:{canEditSettings:true,email:'planner',settings:{document:{checklists:[],serviceTypes:[],calendars:[],vehicles:[]}},users:[{email:'main',display_name:'Técnico principal',enabled:true},{email:'support',display_name:'Técnico de apoio',enabled:true}],schedule:{id:'1',company_id:1,order_id:'14877'},detail:{order:{numero_sequencia:14877,cliente_nome:'Cliente'},materials:[],services:[]},operations:[operation],usage:[],costs:[],events:[],fieldEvents:[],requests:[],profit:null,fieldSessions:[]}}));
 await page.goto('/programacao?id=1');
 const status=page.getByText('Em Execução - envio parcial',{exact:true});
 await expect(status).toBeVisible();await expect(page.getByRole('tooltip')).toHaveCount(0);
 await status.hover();const tooltip=page.getByRole('tooltip');
 await expect(tooltip).toBeVisible();await expect(tooltip).toContainText('Relatório enviado por: Técnico principal');await expect(tooltip).toContainText('Já encerraram / enviaram: Técnico principal');await expect(tooltip).toContainText('Pendentes de encerramento / envio: Técnico de apoio');
 await page.mouse.move(0,0);await expect(tooltip).toHaveCount(0);
 await status.focus();await expect(tooltip).toBeVisible();await page.keyboard.press('Escape');await expect(tooltip).toHaveCount(0);
});
