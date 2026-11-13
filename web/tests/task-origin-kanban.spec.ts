import {test,expect} from "@playwright/test";
test("origin kanban groups preventive tasks together and separates report reviews",async({page,context})=>{
 await context.addCookies([{name:"m8-access",value:"test",domain:"localhost",path:"/"}]);
 const base={status:"not_started",priority:"normal",assigned_to:null,version:1,created_at:"2026-10-29T10:00:00Z",updated_at:"2026-10-29T10:00:00Z",customer:"Cliente",equipment_name:"Compressor"};
 const tasks=[
  {...base,id:"1",title:"Preventiva cliente",source_key:"preventive:1",origin:"Preventiva de Equipamento de Cliente"},
  {...base,id:"2",title:"Preventiva frota",source_key:"preventive-group:2",origin:"Preventiva de Equipamento Próprio"},
  {...base,id:"3",title:"Alertas do relatório",source_key:"manual:order-report-task:10",origin:"Revisão de relatório"},
  {...base,id:"4",title:"Fechar OS",source_key:"manual:order-report-task:11",origin:"Efetuar Fechamento",action_name:"Efetuar Fechamento"},
  {...base,id:"5",title:"Orçar OS",source_key:"manual:order-report-task:12",origin:"Gerar Orçamento",action_name:"Gerar Orçamento"}
 ];
 await page.route("**/api/activity",r=>r.fulfill({json:{admin:false}}));
 await page.route("**/api/task-stages",r=>r.fulfill({json:{stages:[]}}));
 await page.route("**/api/tasks**",r=>r.fulfill({json:r.request().method()==="POST"?{created:0,completed:0}:{tasks,users:[],email:"test@example.com",syncedAt:new Date().toISOString()}}));
 await page.goto("/tarefas");
 await page.getByLabel("Agrupar Kanban por").selectOption("origin");
 await expect(page.getByRole("region",{name:"Preventivas",exact:true}).locator(".task-kanban-card")).toHaveCount(2);
 await expect(page.getByRole("region",{name:"Revisão de relatórios",exact:true}).locator(".task-kanban-card")).toHaveCount(1);
 await expect(page.getByRole("region",{name:"Efetuar Fechamento",exact:true}).locator(".task-kanban-card")).toHaveCount(1);
 await expect(page.getByRole("region",{name:"Gerar Orçamento",exact:true}).locator(".task-kanban-card")).toHaveCount(1);
 await expect(page.locator(".task-kanban-add")).toHaveCount(0);
 for(const card of await page.locator(".task-kanban-card").all()) await expect(card).toHaveAttribute("draggable","false");
});
