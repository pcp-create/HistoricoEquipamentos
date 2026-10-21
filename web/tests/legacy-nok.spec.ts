import {test,expect} from "@playwright/test";
test("legacy NOK turns red and requires a comment in technician report",async({page,context})=>{
 await context.addCookies([{name:"m8-access",value:"test",domain:"localhost",path:"/"}]);
 await context.grantPermissions(["geolocation"]);await context.setGeolocation({latitude:-27,longitude:-49});
 await page.setViewportSize({width:390,height:844});
 await page.clock.setFixedTime(new Date("2026-10-21T12:00:00Z"));
 const row={id:"op1",schedule_id:1,number:15070,position:1,description:"Inspeção",date:"2026-10-21",time:"08:00",status:"awaiting_execution",customer:"Cliente"};
 const users=[{email:"helper",display_name:"Ana Apoio"},{email:"second",display_name:"Bruno Apoio"}];
 const operation={...row,document:{responsible:"tech",support:["helper","second"],internalNote:""}};
 const template={id:'c',name:'Corretiva',stages:[{id:'s',name:'Inspeções',fields:[{id:'f',type:'flag',required:true,label:'Avaliar compressor',options:['OK','NOK','NA']}]}]};
 Object.assign(operation.document,{checklistId:'c',checklistRun:{template,stages:{s:{status:'released',answers:{},details:{}}}}});
 let active:any={id:'live',actor:'tech',operation_id:'op1',kind:'work',state:'running',segment_at:'2026-10-21T12:00:00Z',started_at:'2026-10-21T12:00:00Z',active_seconds:0,pause_seconds:0};
 let start:any,replica:any;
 await page.route("**/api/activity",r=>r.fulfill({json:{}}));
 await page.route("**/api/field*",r=>{
  if(r.request().method()==="POST"){
   start=r.request().postDataJSON();
   active={id:"live",actor:"tech",operation_id:"op1",kind:"work",state:"running",started_at:"2026-10-21T12:00:00Z",segment_at:"2026-10-21T12:00:00Z",active_seconds:0,pause_seconds:0};
   return r.fulfill({json:{saved:true}});
  }
  return r.fulfill({json:r.request().url().includes("?")?{operation,email:"tech",checked:true,infoRead:true,teamAvailable:true,supportMembers:users,settings:{document:{checklists:[template],vehicles:[],pauseReasons:[]}},materials:{complete:true,items:[]},history:[]}:{email:"tech",rows:[row],active}});
 });
 await page.route("**/api/field/time-requests",r=>r.fulfill({json:{email:"tech",users,operations:[operation],fieldEvents:[],events:[],requests:[],fieldSessions:[{id:"10000000-0000-4000-8000-000000000001",operation_id:"op1",actor:"tech",display_name:"Técnico",kind:"work",state:"finished",started_at:"2026-10-20T11:00:00Z",finished_at:"2026-10-20T12:00:00Z",segment_at:"2026-10-20T12:00:00Z",active_seconds:3600,pause_seconds:0}]}}));
 await page.route("**/api/field/replicate",r=>{replica=r.request().postDataJSON();return r.fulfill({json:{saved:true,copied:2}})});
 await page.goto("/tecnico");
 await page.getByRole("button",{name:"Programação",exact:false}).click();
 await page.getByText("OS 15070",{exact:true}).click();
 await page.getByRole("button",{name:/OP01/}).click();
 await page.getByRole('button',{name:'Relatório',exact:true}).click();
 const stage=page.locator('.checklist-stage-response').first();
 await stage.locator(':scope > summary').click();
 await stage.getByRole('radio',{name:'NOK',exact:true}).check();
 await expect(stage.locator('.status-alert-selected')).toHaveCSS('color','rgb(181, 41, 59)');
 await expect(stage.getByText('Comentário *',{exact:true})).toBeVisible();
 await expect(stage.getByRole('textbox',{name:'Comentário — Avaliar compressor'})).toHaveAttribute('required','');
 const comment=stage.getByRole('textbox',{name:'Comentário — Avaliar compressor'});
 await expect(comment).toHaveAttribute('placeholder','Preenchimento obrigatório');
 await expect(comment).toHaveCSS('border-top-color','rgb(196, 56, 72)');
 await comment.fill('Dreno obstruído.');
 await expect(comment).not.toHaveClass(/alert-comment-empty/);
 await comment.fill('');
 await expect(comment).toHaveClass(/alert-comment-empty/);
 await stage.getByRole('radio',{name:'OK',exact:true}).check();
 await expect(stage.locator('.status-alert-selected')).toHaveCount(0);
 await expect(stage.getByRole('textbox',{name:'Comentário — Avaliar compressor'})).not.toHaveAttribute('required','');
});
