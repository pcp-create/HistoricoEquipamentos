import {pickDateTime} from "./helpers/pick-date-time";
import {test,expect} from "@playwright/test";
import {blankOperation} from "../lib/service-scheduling/model";
import {withRescheduling} from "../lib/service-scheduling/rescheduling";
test("sent operations require confirmation, retain history and support cancellation",async({page,context})=>{
 await context.addCookies([{name:"m8-access",value:"test",domain:"localhost",path:"/"}]);
 await page.route("**/api/activity",r=>r.fulfill({json:{admin:false}}));
 let operation:any={id:"op1",position:1,version:1,status:"awaiting_execution",sent_at:"2026-10-20T12:00:00Z",document:{...blankOperation(),description:"Inspeção",date:"2026-10-20",time:"08:00",responsible:"tech",duration:1}};
 const data:any={canEditSettings:true,email:"planner",settings:{document:{checklists:[],serviceTypes:[],calendars:[],vehicles:[]}},users:[{email:"tech",display_name:"Técnico",enabled:true},{email:"planner",display_name:"Planejador",enabled:true}],schedule:{id:"1",company_id:1,order_id:"15070"},detail:{order:{numero_sequencia:15070,cliente_nome:"Cliente"},materials:[],services:[]},operations:[operation],usage:[],costs:[],events:[],fieldSessions:[],fieldEvents:[],requests:[],profit:null};
 const writes:any[]=[];
 await page.route("**/api/service-scheduling**",r=>{
  if(r.request().method()==="POST"){
   const body=r.request().postDataJSON();writes.push(body);
   operation={...operation,version:operation.version+1,document:withRescheduling(operation,body.document,body.rescheduling,"planner")};
   data.operations=[operation];
   return r.fulfill({json:{operation}});
  }
  return r.fulfill({json:data});
 });
 await page.goto("/programacao?OS=15070");
 const date=page.getByLabel("Data de Programação 01",{exact:true});
 const time=page.getByLabel("Hora início 01",{exact:true});
 const save=page.getByRole("button",{name:"Salvar operação 01",exact:true});
 const dialog=page.getByRole("dialog",{name:"Confirmar reprogramação",exact:true});
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:900});
  const heights=await Promise.all([date,time,page.getByLabel("Checklist 01",{exact:true}),page.getByLabel("Responsável 01",{exact:true}),save].map(locator=>locator.evaluate(el=>el.getBoundingClientRect().height)));
  expect(new Set(heights).size).toBe(1);
  const tops=await Promise.all([date,time,page.getByLabel("Veículo 01",{exact:true}),save].map(locator=>locator.evaluate(el=>el.getBoundingClientRect().top)));
  expect(Math.max(...tops)-Math.min(...tops)).toBeLessThanOrEqual(1);
 }
 const row=page.locator(".operations-table tbody > tr").first();
 const initialHeight=await row.evaluate(el=>el.getBoundingClientRect().height);
 await date.click();await expect(page.getByRole('dialog',{name:'Data de Programação 01',exact:true})).toHaveCount(0);
 await date.fill("31/02/2026");await date.blur();await expect(date).toHaveValue("20/10/2026");
 await date.fill("24102026");await expect(date).toHaveValue("24/10/2026");await date.blur();
 await expect(date).toHaveAttribute("aria-invalid","false");
 expect(await row.evaluate(el=>el.getBoundingClientRect().height)).toBe(initialHeight);
 await date.fill("21102026");await date.blur();
 await expect(dialog).toHaveCount(0);
 await time.fill("09:30");await time.blur();
 await expect(dialog).toHaveCount(0);
 expect(writes).toHaveLength(0);
 await save.click();
 await expect(dialog).toBeVisible();
 await expect(dialog).toContainText("21/10/2026 09:30");
 await expect(dialog.getByRole("button",{name:"Confirmar e salvar"})).toBeDisabled();
 await dialog.getByRole("button",{name:"Cancelar alteração de data"}).click();
 await expect(date).toHaveValue("20/10/2026");
 await expect(time).toHaveValue("08:00");
 expect(writes).toHaveLength(0);
 for(const [day,reason] of [["2026-10-21","Técnico indisponível"],["2026-10-22","Cliente solicitou adiamento"]]){
  await pickDateTime(page,"Data de Programação 01",day);await date.blur();
  await pickDateTime(page,"Hora início 01","09:30");await time.blur();
  await expect(dialog).toHaveCount(0);
  if(day==="2026-10-21")await save.click();
  else await save.click();
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("09:30");
  await dialog.getByRole("textbox",{name:"Justificativa da reprogramação"}).fill(reason);
  await dialog.getByRole("button",{name:"Confirmar e salvar"}).click();
  await expect(dialog).toHaveCount(0);
 }
 await page.getByRole("button",{name:"Reprogramada ×2",exact:true}).click();
 const history=page.getByRole("dialog",{name:"Histórico de reprogramações",exact:true});
 await expect(history).toContainText("20/10/2026");
 await expect(history).toContainText("22/10/2026");
 await expect(history).toContainText("Técnico indisponível");
 await expect(history).toContainText("Cliente solicitou adiamento");
 expect(writes).toHaveLength(2);
 expect(writes[0].scheduleId).toBe("1");
 expect(writes[0].document.time).toBe("09:30");
 expect(operation.document.reschedulingHistory[0].toTime).toBe("09:30");
 expect(operation.status).toBe("awaiting_execution");
});
