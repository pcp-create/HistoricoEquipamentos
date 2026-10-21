import {test,expect} from "@playwright/test";
test("technician selects support members for joint activity and for a finished log replica",async({page,context})=>{
 await context.addCookies([{name:"m8-access",value:"test",domain:"localhost",path:"/"}]);
 await context.grantPermissions(["geolocation"]);await context.setGeolocation({latitude:-27,longitude:-49});
 await page.setViewportSize({width:390,height:844});
 await page.clock.setFixedTime(new Date("2026-10-21T12:00:00Z"));
 const row={id:"op1",schedule_id:1,number:15070,position:1,description:"Inspeção",date:"2026-10-21",time:"08:00",status:"awaiting_execution",customer:"Cliente"};
 const users=[{email:"helper",display_name:"Ana Apoio"},{email:"second",display_name:"Bruno Apoio"}];
 const operation={...row,document:{responsible:"tech",support:["helper","second"],internalNote:""}};
 let active:any=null;
 let start:any,replica:any;
 await page.route("**/api/activity",r=>r.fulfill({json:{}}));
 await page.route("**/api/field*",r=>{
  if(r.request().method()==="POST"){
   start=r.request().postDataJSON();
   active={id:"live",actor:"tech",operation_id:"op1",kind:"work",state:"running",started_at:"2026-10-21T12:00:00Z",segment_at:"2026-10-21T12:00:00Z",active_seconds:0,pause_seconds:0};
   return r.fulfill({json:{saved:true}});
  }
  return r.fulfill({json:r.request().url().includes("?")?{operation,email:"tech",checked:true,infoRead:true,teamAvailable:true,supportMembers:users,settings:{document:{checklists:[],vehicles:[],pauseReasons:[]}},materials:{complete:true,items:[]},history:[]}:{email:"tech",rows:[row],active}});
 });
 await page.route("**/api/field/time-requests",r=>r.fulfill({json:{email:"tech",users,operations:[operation],fieldEvents:[],events:[],requests:[],fieldSessions:[{id:"10000000-0000-4000-8000-000000000001",operation_id:"op1",actor:"tech",display_name:"Técnico",kind:"work",state:"finished",started_at:"2026-10-20T11:00:00Z",finished_at:"2026-10-20T12:00:00Z",segment_at:"2026-10-20T12:00:00Z",active_seconds:3600,pause_seconds:0}]}}));
 await page.route("**/api/field/replicate",r=>{replica=r.request().postDataJSON();return r.fulfill({json:{saved:true,copied:2}})});
 await page.goto("/tecnico");
 await page.getByRole("button",{name:"Programação",exact:false}).click();
 await page.getByText("OS 15070",{exact:true}).click();
 await page.getByRole("button",{name:/OP01/}).click();
 await page.getByRole("button",{name:"Iniciar com equipe",exact:true}).click();
 const picker=page.getByRole("dialog",{name:"Iniciar com equipe",exact:true});
 await expect(picker.getByRole("button",{name:"Iniciar com equipe",exact:true})).toBeDisabled();
 expect(await picker.evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true);
 await page.screenshot({path:"/tmp/field-team-picker.png"});
 await picker.getByLabel("Ana Apoio",{exact:true}).check();
 await picker.getByRole("button",{name:"Iniciar com equipe",exact:true}).click();
 await expect(picker).toHaveCount(0);
 expect(start.teamMembers).toEqual(["helper"]);
 await page.getByRole("button",{name:"Apontamentos",exact:true}).click();
 await expect(page.getByRole("button",{name:"Incluir apontamento manual",exact:true})).toBeVisible();
 await expect(page.getByRole("button",{name:"Solicitar ajuste",exact:true})).toBeVisible();
 await page.getByRole("button",{name:"Replicar apontamento",exact:true}).click();
 const copy=page.getByRole("dialog",{name:"Replicar apontamento",exact:true});
 await copy.getByLabel("Ana Apoio",{exact:true}).check();await copy.getByLabel("Bruno Apoio",{exact:true}).check();
 await copy.getByRole("button",{name:"Replicar apontamento",exact:true}).click();
 await expect(copy).toHaveCount(0);
 expect(replica.members).toEqual(["helper","second"]);
 expect(replica.sessionId).toBe("10000000-0000-4000-8000-000000000001");
});
