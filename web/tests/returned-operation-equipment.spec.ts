import {test,expect} from '@playwright/test';
import {blankOperation} from '../lib/service-scheduling/model';
test('returning an operation unlocks equipment; saving and redispatching locks it again',async({page,context})=>{
 await context.addCookies([{name:'m8-access',value:'test',domain:'localhost',path:'/'}]);
 await page.route('**/api/activity',r=>r.fulfill({json:{admin:false}}));
 const operation:any={id:'op1',position:1,version:1,status:'awaiting_execution',sent_at:'2026-11-09T12:00:00Z',document:{...blankOperation(),date:'2026-11-09',time:'08:00',duration:1,responsible:'tech',equipmentId:'77',equipment:{name:'Compressor original'},equipmentLocked:true,checklistRun:{equipmentId:'77'}}};
 const data:any={canEditSettings:true,email:'planner',settings:{document:{checklists:[],serviceTypes:[],calendars:[],vehicles:[]}},users:[{email:'tech',display_name:'Técnico',enabled:true}],schedule:{id:'1',company_id:1,order_id:'15070'},detail:{order:{numero_sequencia:15070,cliente_nome:'Cliente'},materials:[],services:[]},operations:[operation],usage:[],costs:[],events:[],fieldSessions:[],fieldEvents:[],requests:[],profit:null};
 const writes:any[]=[];
 await page.route('**/api/service-scheduling**',r=>{
  if(r.request().method()==='GET')return r.fulfill({json:data});
  const body=r.request().postDataJSON();writes.push(body);operation.version++;
  if(body.action==='recall'){operation.sent_at=null;operation.status='scheduled';operation.document.checklistReturn={reason:body.reason};}
  if(body.action==='operation')operation.document=body.document;
  if(body.action==='dispatch'){operation.sent_at=new Date().toISOString();operation.status='awaiting_execution';delete operation.document.checklistReturn;}
  return r.fulfill({json:{operation}});
 });
 await page.route('**/api/service-scheduling/equipment?*',r=>r.fulfill({json:{rows:[{equipment_id:'78',name:'Compressor corrigido',serial:'NOVO'}],hasMore:false}}));
 await page.goto('/programacao?OS=15070');
 const picker=page.locator('.operations-table tbody>tr').first().locator('td').nth(3).getByRole('button');
 await expect(picker).toBeDisabled();
 page.once('dialog',d=>d.accept('Corrigir equipamento'));
 await page.getByRole('button',{name:'Retornar OS ao planejamento',exact:true}).click();
 await expect(picker).toBeEnabled();await picker.click();
 await page.getByRole('button',{name:/Compressor corrigido/}).click();
 await page.getByRole('button',{name:'Salvar operação 01',exact:true}).click();
 await expect.poll(()=>writes.find(w=>w.action==='operation')?.document.equipmentId).toBe('78');
 await page.getByRole('button',{name:'Enviar ao técnico',exact:true}).click();
 await expect(picker).toBeDisabled();
});
