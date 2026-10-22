import {test,expect} from "@playwright/test";
test("opens registry, searches, filters and refreshes",async({page,context})=>{
 await context.addCookies([{name:"m8-access",value:"test",domain:"localhost",path:"/"}]);
 await page.route("**/api/activity",r=>r.fulfill({json:{admin:false}}));
 await page.route("**/api/registries/order-types",r=>r.fulfill({json:{count:2,rows:[{id:"1",name:"Manutenção preventiva",active:true,collected_at:"2026-10-22T00:00:00Z"},{id:"2",name:"Corretiva",active:false,collected_at:"2026-10-22T00:00:00Z"}]}}));
 await page.goto("/configuracoes/cadastros");
 await page.getByRole("button",{name:/Tipo Ordens de Serviço/}).click();
 await expect(page.getByRole("cell",{name:"Corretiva",exact:true})).toBeVisible();
 await page.getByLabel("Pesquisar por ID ou nome").fill("manutencao");
 await expect(page.getByRole("cell",{name:"Corretiva",exact:true})).toHaveCount(0);
 await page.getByLabel("Pesquisar por ID ou nome").fill("");
 await page.getByRole("combobox",{name:/Ativo/}).selectOption("inactive");
 await expect(page.getByRole("cell",{name:"Manutenção preventiva",exact:true})).toHaveCount(0);
 await page.getByRole("button",{name:"Atualizar do M8"}).click();
 await expect(page.getByRole("status")).toContainText("2 tipos de OS atualizados");
});
test("quote registry uses its own endpoint and resets filters when switching lists",async({page,context})=>{
 await context.addCookies([{name:"m8-access",value:"test",domain:"localhost",path:"/"}]);
 await page.route("**/api/activity",r=>r.fulfill({json:{admin:false}}));
 let refreshed=false;
 await page.route("**/api/registries/quote-types",r=>{if(r.request().method()==="POST")refreshed=true;return r.fulfill({json:{count:1,rows:[{id:"18",name:"Orçamento de peças",active:false,collected_at:"2026-10-22T00:00:00Z"}]}});});
 await page.route("**/api/registries/order-types",r=>r.fulfill({json:{rows:[{id:"1",name:"Corretiva",active:true,collected_at:"2026-10-22T00:00:00Z"}]}}));
 await page.goto("/configuracoes/cadastros");
 await page.getByRole("button",{name:/Tipos de Orçamento/}).click();
 await expect(page.getByRole("cell",{name:"Orçamento de peças"})).toBeVisible();
 await page.getByRole("button",{name:"Atualizar do M8"}).click();
 await expect(page.getByRole("status")).toContainText("1 tipos de orçamento atualizados");
 expect(refreshed).toBe(true);
 await page.getByLabel("Pesquisar por ID ou nome").fill("peças");
 await page.getByRole("button",{name:"Todos os cadastros"}).click();
 await page.getByRole("button",{name:/Tipo Ordens de Serviço/}).click();
 await expect(page.getByLabel("Pesquisar por ID ou nome")).toHaveValue("");
 await expect(page.getByRole("cell",{name:"Corretiva"})).toBeVisible();
 await expect(page.getByRole("cell",{name:"Orçamento de peças"})).toHaveCount(0);
});
test("edits warranty from an existing service type row",async({page,context})=>{
 await context.addCookies([{name:"m8-access",value:"test",domain:"localhost",path:"/"}]);
 await page.route("**/api/activity",r=>r.fulfill({json:{admin:false}}));
 let row={id:"13",name:"CORRETIVA",active:true,warranty_id:null as number|null,warranty_description:""};
 let saved:any;
 await page.route("**/api/registries/service-types",r=>{
  if(r.request().method()==="POST"){saved=r.request().postDataJSON();row={...row,...saved};}
  return r.fulfill({json:{rows:[row]}});
 });
 await page.goto("/configuracoes/cadastros");
 await page.getByRole("button",{name:/Tipo Atendimento/}).click();
 await page.getByRole("button",{name:"Editar CORRETIVA"}).click();
 await expect(page.getByLabel("ID no M8 *",{exact:true})).toHaveValue("13");
 await expect(page.getByLabel("Nome *",{exact:true})).toHaveValue("CORRETIVA");
 await page.getByLabel("ID Prazo Garantia no M8 *",{exact:true}).fill("3");
 await page.getByLabel("Prazo Garantia *",{exact:true}).fill("90 dias");
 await page.getByRole("button",{name:"Salvar alterações"}).click();
 await expect(page.getByRole("cell",{name:"90 dias",exact:true})).toBeVisible();
 expect(saved).toMatchObject({id:"13",name:"CORRETIVA",active:true,warranty_id:"3",warranty_description:"90 dias"});
});
