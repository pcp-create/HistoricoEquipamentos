import {test,expect} from '@playwright/test';import {blankOperation} from '../lib/service-scheduling/model';
for (const scenario of [{name:'historical',date:'2026-11-14',allowed:true},{name:'same date',date:'2026-11-13',allowed:false},{name:'later reading',date:'2026-11-12',allowed:false}]) test(`review handles ${scenario.name} lower meter using collection dates`,async({page,context})=>{
 await context.addCookies([{name:'m8-access',value:'test',domain:'localhost',path:'/'}]);
 await page.route('**/api/activity',r=>r.fulfill({json:{admin:true}}));
 const template={id:'t',name:'Relatório',stages:[{id:'s',name:'Medições',fields:[{id:'m',label:'Horímetro Total',type:'meter',required:true}]}]};
 const operation:any={id:'op1',position:1,version:1,status:'awaiting_review',sent_at:'2026-11-13T13:00:00Z',document:{...blankOperation(),equipmentId:'7',responsible:'tech',checklistId:'t',checklistRun:{template,equipmentId:'7',meterDate:'2026-11-13',submission:{at:'2026-11-13T13:00:00Z',by:'tech'},stages:{s:{status:'submitted',answers:{m:100}}}}}};
 const data:any={canEditSettings:true,email:'planner',settings:{document:{checklists:[template],serviceTypes:[],calendars:[],vehicles:[]}},users:[],schedule:{id:'1',company_id:1,order_id:'100'},detail:{order:{numero_sequencia:123,cliente_nome:'Cliente',equipamento:'Compressor'},materials:[],services:[]},operations:[operation],usage:[],costs:[],events:[],fieldSessions:[],fieldEvents:[],requests:[],profit:null};
 const writes:any[]=[];
 await page.route('**/api/service-scheduling**',r=>{if(r.request().method()==='POST'){const body=r.request().postDataJSON();writes.push(body);operation.status='reviewed';operation.version++;return r.fulfill({json:{operation}});}return r.fulfill({json:data});});
 await page.route('**/api/service-scheduling/equipment?reading=7',r=>r.fulfill({json:{meter:200,meterDate:scenario.date}}));
 await page.goto('/programacao?id=1');await page.getByRole('button',{name:'Acompanhar execução',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Revisão da operação 01'});
 if(scenario.allowed){
  await expect(dialog.getByText('Horímetro abaixo da última coleta')).toHaveCount(0);
  await expect(dialog.getByRole('button',{name:'Concluir revisão',exact:true})).toBeEnabled();
  await dialog.getByRole('button',{name:'Concluir revisão',exact:true}).click();
  await expect.poll(()=>writes.length).toBe(1);
  expect(writes[0].confirmLowerMeter).toBeUndefined();
 }else{
  await expect(dialog.getByText('Horímetro abaixo da última coleta')).toBeVisible();
  await expect(dialog.getByRole('button',{name:'Concluir revisão',exact:true})).toBeDisabled();
  await expect(dialog.getByRole('button',{name:'Confirmar horímetro real da máquina'})).toHaveCount(0);
 }
});
