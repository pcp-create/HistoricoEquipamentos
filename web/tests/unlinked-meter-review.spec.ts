import {test,expect} from '@playwright/test';
import {blankOperation} from '../lib/service-scheduling/model';

test('review warns about an unlinked meter without querying equipment or requiring an alert task',async({page,context})=>{
 await context.addCookies([{name:'m8-access',value:'test',domain:'localhost',path:'/'}]);
 await page.route('**/api/activity',r=>r.fulfill({json:{admin:true}}));
 const template={id:'check',name:'Relatório',items:[],stages:[{id:'s',name:'Medições',fields:[{id:'meter',label:'Horímetro',type:'meter',required:true}]}]};
 const operation={id:'op1',position:1,version:1,status:'awaiting_review',document:{...blankOperation(),responsible:'tech',description:'Revisar operação',checklistId:'check',checklistRun:{template,equipmentId:'999',meterDate:'2026-11-06',submission:{at:'2026-11-10T12:00:00Z',by:'tech'},stages:{s:{status:'submitted',answers:{meter:12028}}}}}};
 const data={canEditSettings:true,email:'planner',settings:{version:1,document:{checklists:[template],serviceTypes:[],calendars:[],vehicles:[]}},users:[{email:'tech',display_name:'Técnico',enabled:true}],schedule:{id:'1',company_id:1,order_id:'100'},detail:{order:{numero_sequencia:100,cliente_nome:'Cliente'},materials:[],services:[]},operations:[operation],usage:[],costs:[],events:[],fieldSessions:[],fieldEvents:[],requests:[],profit:null};
 let readingQueries=0;
 await page.route('**/api/service-scheduling**',r=>{if(r.request().url().includes('reading='))readingQueries++;return r.fulfill({json:data});});
 await page.goto('/programacao?id=1');
 await page.getByRole('button',{name:'Acompanhar execução',exact:true}).click();
 const review=page.getByRole('dialog',{name:'Revisão da operação 01'});
 await expect(review.getByRole('alert')).toContainText('Nenhuma coleta de horímetro ou atualização de preventiva');
 await expect(review.getByRole('tab',{name:'Alertas (1)',exact:true})).toBeVisible();
 await review.getByRole('tab',{name:'Alertas (1)',exact:true}).click();
 await expect(review.getByRole('alert')).toContainText('somente no relatório');
 await expect(review.getByRole('button',{name:/Resolver alertas/})).toHaveCount(0);
 expect(readingQueries).toBe(0);
});
