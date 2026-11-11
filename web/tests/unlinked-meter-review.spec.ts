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
 await expect(review.getByRole('alert')).toHaveCount(0);
 await expect(review.getByRole('tab',{name:'Alertas (1)',exact:true})).toBeVisible();
 await review.getByRole('tab',{name:'Alertas (1)',exact:true}).click();
 await expect(review.getByRole('alert')).toContainText('somente no relatório');
 await expect(review.getByRole('button',{name:/Resolver alertas/})).toHaveCount(0);
 expect(readingQueries).toBe(0);
});

test('review can assign or remove equipment before completion and preserves the meter',async({page,context})=>{
 await context.addCookies([{name:'m8-access',value:'test',domain:'localhost',path:'/'}]);
 await page.route('**/api/activity',r=>r.fulfill({json:{admin:true}}));
 const template={id:'check',name:'Relatório',items:[],stages:[{id:'s',name:'Medições',fields:[{id:'meter',label:'Horímetro',type:'meter',required:true}]}]};
 const operation:any={id:'op1',position:1,version:1,status:'awaiting_review',document:{...blankOperation(),responsible:'tech',description:'Revisar operação',checklistId:'check',checklistRun:{template,equipmentId:'999',meterDate:'2026-11-06',submission:{at:'2026-11-10T12:00:00Z',by:'tech'},stages:{s:{status:'submitted',answers:{meter:12028}}}}}};
 const data={canEditSettings:true,email:'planner',settings:{version:1,document:{checklists:[template],serviceTypes:[],calendars:[],vehicles:[]}},users:[{email:'tech',display_name:'Técnico',enabled:true}],schedule:{id:'1',company_id:1,order_id:'100'},detail:{order:{numero_sequencia:100,cliente_nome:'Cliente'},materials:[],services:[]},operations:[operation],usage:[],costs:[],events:[],fieldSessions:[],fieldEvents:[],requests:[],profit:null};

 const changes:any[]=[];
 await page.route('**/api/service-scheduling**',r=>{
  const url=new URL(r.request().url());
  if(url.pathname.endsWith('/equipment'))return r.fulfill({json:{rows:[{equipment_id:'7',name:'Compressor correto',serial:'ABC',origin:'client'}],hasMore:false}});
  if(url.searchParams.has('reading'))return r.fulfill({json:{meter:10000,meterDate:'2026-11-01'}});
  if(r.request().method()==='POST'){
   const body=r.request().postDataJSON();changes.push(body);
   if(body.action==='review_equipment'){
    operation.document.equipmentId=body.equipmentId;operation.document.equipmentUnassigned=!body.equipmentId;
    operation.document.equipment=body.equipmentId?{name:'Compressor correto'}:undefined;
    operation.document.checklistRun.equipmentId=body.equipmentId;
   }else if(body.action==='review')operation.status='reviewed';
   else throw Error('Unexpected action '+body.action);
   operation.version++;return r.fulfill({json:{operation}});
  }
  return r.fulfill({json:data});
 });
 await page.goto('/programacao?id=1');await page.getByRole('button',{name:'Acompanhar execução',exact:true}).click();
 const review=page.getByRole('dialog',{name:'Revisão da operação 01'});
 const equipment=review.locator('.review-report-row').filter({has:page.getByText('Ativo',{exact:true})});
 await expect(review.getByRole('region',{name:'Equipamento da operação na revisão'})).toHaveCount(0);
 await review.getByRole('tab',{name:'Alertas (1)',exact:true}).click();
 await review.getByRole('alert').getByRole('button',{name:'Selecionar equipamento',exact:true}).click();
 const picker=page.getByRole('dialog',{name:'Selecionar equipamento da operação'});
 await expect(picker.getByRole('button',{name:'Usar equipamento da OS',exact:true})).toHaveCount(0);
 await picker.getByRole('button',{name:/Compressor correto/}).click();
 await review.getByRole('tab',{name:'Relatório',exact:true}).click();
 await expect(equipment.getByRole('button',{name:/Compressor correto/})).toBeVisible();
 await expect(review.getByLabel('Data da leitura — Horímetro',{exact:true})).toBeVisible();
 await expect(review.getByRole('alert')).toHaveCount(0);
 await equipment.getByRole('button',{name:/Compressor correto/}).click();
 await picker.getByRole('button',{name:'Sem equipamento informado',exact:true}).click();
 await expect(equipment.getByRole('button',{name:'Sem equipamento informado',exact:true})).toBeVisible();
 await expect(review.getByRole('alert')).toHaveCount(0);
 await review.getByRole('tab',{name:'Alertas (1)',exact:true}).click();
 await expect(review.getByRole('alert')).toContainText('somente no relatório');
 expect(operation.document.checklistRun.stages.s.answers.meter).toBe(12028);
 expect(operation.document.checklistRun.equipmentId).toBe('');
 await review.getByRole('button',{name:'Concluir revisão',exact:true}).click();
 await expect.poll(()=>operation.status).toBe('reviewed');
 expect(changes.map(b=>b.action)).toEqual(['review_equipment','review_equipment','review']);
 await expect(equipment.getByRole('button')).toHaveCount(0);
});

test('lower total meter is red in the report and listed under Alerts, updating immediately on correction',async({page,context})=>{
 await context.addCookies([{name:'m8-access',value:'test',domain:'localhost',path:'/'}]);
 await page.route('**/api/activity',r=>r.fulfill({json:{admin:true}}));
 const template={id:'check',name:'Relatório',items:[],stages:[{id:'s',name:'Medições',fields:[{id:'meter',label:'Horímetro',type:'meter',required:true}]}]};
 const operation:any={id:'op1',position:1,version:1,status:'awaiting_review',document:{...blankOperation(),responsible:'tech',description:'Revisar operação',checklistId:'check',checklistRun:{template,equipmentId:'999',meterDate:'2026-11-06',submission:{at:'2026-11-10T12:00:00Z',by:'tech'},stages:{s:{status:'submitted',answers:{meter:12028}}}}}};
 const data={canEditSettings:true,email:'planner',settings:{version:1,document:{checklists:[template],serviceTypes:[],calendars:[],vehicles:[]}},users:[{email:'tech',display_name:'Técnico',enabled:true}],schedule:{id:'1',company_id:1,order_id:'100'},detail:{order:{numero_sequencia:100,cliente_nome:'Cliente'},materials:[],services:[]},operations:[operation],usage:[],costs:[],events:[],fieldSessions:[],fieldEvents:[],requests:[],profit:null};

 operation.document.equipmentId='7';operation.document.equipment={name:'Compressor'};operation.document.checklistRun.equipmentId='7';
 let readings=0;
 await page.route('**/api/service-scheduling**',r=>{
  const url=new URL(r.request().url());
  if(url.searchParams.has('reading')){readings++;return r.fulfill({json:{meter:79399,meterDate:'2026-11-05'}});}
  return r.fulfill({json:data});
 });
 await page.goto('/programacao?id=1');await page.getByRole('button',{name:'Acompanhar execução',exact:true}).click();
 const review=page.getByRole('dialog',{name:'Revisão da operação 01'});
 const meter=review.getByRole('spinbutton',{name:'Horímetro',exact:true});
 await expect(meter).toHaveAttribute('aria-invalid','true');
 const color=await meter.evaluate(element=>getComputedStyle(element).borderTopColor.match(/\d+/g)!.map(Number));
 expect(color[0]).toBeGreaterThan(color[1]*2);expect(color[0]).toBeGreaterThan(color[2]*2);
 await expect(review.getByRole('tab',{name:'Alertas (1)',exact:true})).toBeVisible();
 const initialReadings=readings;expect(initialReadings).toBeGreaterThan(0);
 await review.getByRole('tab',{name:'Alertas (1)',exact:true}).click();
 await expect(review.getByRole('alert')).toContainText('79.399');
 await review.getByRole('button',{name:'Verificar campo no relatório',exact:true}).click();
 await meter.fill('80000');
 await expect(meter).not.toHaveAttribute('aria-invalid','true');
 await expect(review.getByRole('tab',{name:'Alertas (0)',exact:true})).toBeVisible();
 await meter.fill('12028');
 await expect(review.getByRole('tab',{name:'Alertas (1)',exact:true})).toBeVisible();
 await expect(meter).toHaveAttribute('aria-invalid','true');
 expect(readings).toBe(initialReadings);
});
