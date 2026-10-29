import {test,expect} from "@playwright/test";
test("warehouse selects several materials and records one delivery to the chosen technician",async({page,context})=>{
 await context.addCookies([{name:"m8-access",value:"test",domain:"localhost",path:"/"}]);
 await page.route("**/api/activity",r=>r.fulfill({json:{admin:false}}));
 const order={company_id:1,id:"100",number:"15100",customer:"Cliente teste",flow:"51 - O.S AGUARDANDO SEPARAÇÃO",status:"Pendente"};
 const items=[{id_m8:"55",produto_id:"7",produto_nome:"Filtro",quantidade:5,unidade_nome:"UN",delivery:{quantity:0},usage:{gross:0,returned:0}},{id_m8:"56",produto_id:"8",produto_nome:"Óleo",quantidade:10,unidade_nome:"L",delivery:{quantity:0},usage:{gross:0,returned:0}}];
 let saved:any;const history:any[]=[];
 await page.route("**/api/warehouse**",r=>{
  if(r.request().method()==="POST"){saved=r.request().postDataJSON();history.push({item_id:'55',kind:'delivery',quantity:2,technician_name:'Funcionário teste',actor_name:'Almoxarife',created_at:'2026-10-29T12:00:00Z',withdrawal_approval:{taskId:'77',state:'pending'}});return r.fulfill({json:{saved:true,approvalTaskId:'77'}});}
  return r.fulfill({json:new URL(r.request().url()).searchParams.has("order")?{order,complete:true,items,history}:{rows:[order],total:1,users:[{email:"tech",name:"Técnico teste",job_title:"Técnico"}]}});
 });
 await page.goto("/almoxarifado");
 await page.getByRole("button",{name:/OS-15100/}).click();
 await page.getByLabel("Funcionário que retirou",{exact:true}).selectOption("tech");
 await page.getByRole("checkbox",{name:"Selecionar todos os materiais"}).check();
 await page.getByRole("spinbutton",{name:"Entregar Filtro"}).fill("2");
 await page.getByRole("spinbutton",{name:"Entregar Óleo"}).fill("4");
 await page.getByRole("button",{name:"Registrar entrega dos selecionados"}).click();
 await expect(page.locator(".warehouse-success")).toContainText("Entrega registrada");
 expect(saved.technician).toBe("tech");
 expect(saved.items).toEqual([{id:"55",quantity:2},{id:"56",quantity:4}]);
 await expect(page.getByRole('link',{name:'TAR-77 · Aguardando confirmação da retirada',exact:true})).toBeVisible();
 history[0].withdrawal_approval={taskId:'77',state:'approved',decidedBy:'Funcionário teste',decidedAt:'2026-10-29T13:00:00Z',reason:'Recebi os materiais.'};
 await page.getByRole('button',{name:'Atualizar',exact:true}).click();
 await expect(page.getByRole('link',{name:'TAR-77 · Retirada aprovada via tarefa',exact:true})).toBeVisible();
 await expect(page.locator('.warehouse-withdrawal-approval')).toContainText('Recebi os materiais.');

 await page.setViewportSize({width:390,height:844});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:"test-results/warehouse-mobile.png",fullPage:true});
});

test('warehouse kanban, return receipt, later product addition and supply information',async({page,context})=>{
 await context.addCookies([{name:'m8-access',value:'test',domain:'localhost',path:'/'}]);
 await page.route('**/api/**',r=>r.fulfill({json:{}}));
 await page.route('**/api/tasks**',r=>r.fulfill({json:{tasks:[],users:[]}}));
 const order={company_id:1,id:'100',number:'15100',customer:'Cliente teste',flow:'51 - O.S AGUARDANDO SEPARAÇÃO',status:'Pendente'};
 const supply={stock:12,available:8,unit:'UN',stock_at:'2026-10-29T12:00:00Z'};
 const purchases={imported:true,complete:true,groups:[{unit:'UN',quantity:'5',orders:['900'],deliveryDates:['2026-11-05']}]};
 const items:any[]=[{id_m8:'55',produto_id:'7',produto_nome:'Filtro',quantidade:5,unidade_nome:'UN',delivery:{quantity:3},received:{quantity:0},usage:{gross:3,returned:1},supply,purchases}];
 const detail:any={order,complete:true,items,history:[],additions:[]};let posted:any;
 await page.route('**/api/warehouse**',r=>{
  if(r.request().method()==='POST'){
   posted=r.request().postDataJSON();
   if(posted.action==='receipt'){items[0].received.quantity=posted.items[0].quantity;detail.history.push({item_id:'55',kind:'receipt',quantity:posted.items[0].quantity,technician_name:'Técnico teste',actor_name:'Almoxarife',created_at:'2026-10-29T12:00:00Z'});return r.fulfill({json:{saved:true}});}
   items.push({id_m8:'56',produto_id:'8',produto_nome:'Reparo',quantidade:posted.quantity,unidade_nome:'UN',delivery:{quantity:0},received:{quantity:0},usage:{gross:0,returned:0},addedLater:true,supply,purchases});
   detail.additions.push({id:'addition',state:'complete',item_id:'56',document:{product:'8',quantity:posted.quantity,justification:posted.justification},actor:'Almoxarife',created_at:'2026-10-29T13:00:00Z'});
   return r.fulfill({json:{state:'complete',itemId:'56'}});
  }
  const p=new URL(r.request().url()).searchParams;
  if(p.has('products'))return r.fulfill({json:{rows:[{id:'8',name:'Reparo',unit:'UN',price:20,supply,purchases}],total:1}});
  return r.fulfill({json:p.has('order')?detail:{rows:[order,{...order,id:'101',number:'15101',flow:'5 - MATERIAL SEPARADO'}],total:2,users:[{email:'tech',name:'Técnico teste'}]}});
 });
 await page.route('**/api/orders/1/100',r=>r.fulfill({json:{order:{company_id:1,id_m8:'100',numero_sequencia:15100,cliente_nome:'Cliente teste',status:'Pendente'},materials:items,services:[],equipment:[],detail_at:'2026-10-29T12:00:00Z'}}));
 await page.goto('/almoxarifado');await page.getByRole('button',{name:'Kanban',exact:true}).click();
 await expect(page.getByRole('region',{name:'Aguardando separação'})).toBeVisible();
 await expect(page.getByRole('region',{name:'Material separado'})).toBeVisible();
 await page.getByRole('button',{name:/OS-15100/}).click();
 await expect(page.getByRole('columnheader',{name:'Recebido',exact:true})).toBeVisible();
 await expect(page.locator('.warehouse-detail')).toContainText('Estoque: 12 UN');
 await expect(page.locator('.warehouse-detail')).toContainText('Em compra: 5 UN');
 await expect(page.locator('.warehouse-detail')).toContainText('05/11/2026');
 await page.getByRole('button',{name:'Receber devoluções',exact:true}).click();
 await page.getByLabel('Funcionário que devolveu',{exact:true}).selectOption('tech');
 await page.getByRole('checkbox',{name:'Selecionar Filtro',exact:true}).check();
 await page.getByRole('spinbutton',{name:'Receber Filtro',exact:true}).fill('0.5');
 await page.getByRole('button',{name:'Registrar recebimento dos selecionados'}).click();
 await expect(page.locator('.warehouse-success')).toContainText('Recebimento da devolução registrado');expect(posted.action).toBe('receipt');
 await expect(page.locator('.warehouse-history')).toContainText('Recebimento da devolução');
 await expect(page.locator('.warehouse-history')).toContainText('Recebido por: Almoxarife');
 await page.getByRole('button',{name:'Adicionar Material',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Adicionar material na OS'});
 await dialog.getByRole('button',{name:/8 · Reparo/}).click();
 await dialog.getByLabel('Quantidade (UN)',{exact:true}).fill('2');
 await dialog.getByRole('button',{name:'Incluir na OS',exact:true}).click();
 await expect(dialog).toBeVisible();
 await dialog.getByLabel('Justificativa da inclusão *',{exact:true}).fill('Troca necessária após diagnóstico');
 await dialog.getByRole('button',{name:'Incluir na OS',exact:true}).click();
 await expect(dialog).toHaveCount(0);expect(posted.action).toBe('add_material');expect(posted.product).toBe('8');expect(posted.quantity).toBe(2);expect(posted.justification).toBe('Troca necessária após diagnóstico');
 await expect(page.locator('.warehouse-added-badge')).toHaveText('Incluído posteriormente');
 await expect(page.locator('.warehouse-history')).toContainText('Inclusão posterior de material');
 await expect(page.locator('.warehouse-history')).toContainText('Troca necessária após diagnóstico');
 await page.getByRole('link',{name:'OS-15100',exact:true}).click();
 await expect(page.locator('.drawer .material-supply').first()).toContainText('Estoque: 12 UN');
 await expect(page.locator('.drawer .material-supply').first()).toContainText('Em compra: 5 UN');
});

test('delivered queue opens completed orders and flow action saves to the M8',async({page,context})=>{
 await context.addCookies([{name:'m8-access',value:'test',domain:'localhost',path:'/'}]);
 await page.route('**/api/**',r=>r.fulfill({json:{}}));
 const order:any={company_id:1,id:'100',number:'15100',customer:'Cliente teste',flow_id:'5',flow:'Material separado',status:'Pendente'};
 const items=[{id_m8:'55',produto_id:'7',produto_nome:'Filtro',quantidade:2,unidade_nome:'UN',delivery:{quantity:0},received:{quantity:0},usage:{gross:0,returned:0}}];
 let delivered=false,flowPost:any;const flowHistory:any[]=[];
 await page.route('**/api/warehouse**',r=>{
  const p=new URL(r.request().url()).searchParams;
  if(r.request().method()==='POST'){
   const body=r.request().postDataJSON();
   if(body.action==='flow'){flowPost=body;order.flow_id='18';order.flow='Liberado para faturamento';flowHistory.push({id:'flow',actor_name:'Almoxarife',state:'complete',document:{before:'Material separado',after:order.flow},created_at:'2026-10-29T12:00:00Z'});return r.fulfill({json:{state:'complete',message:'Status do fluxo atualizado no M8.'}});}
   delivered=true;items[0].delivery.quantity=2;return r.fulfill({json:{saved:true}});
  }
  if(p.has('flowStatuses'))return r.fulfill({json:{rows:[{id:'5',name:'Material separado'},{id:'18',name:'Liberado para faturamento'}]}});
  if(p.has('order'))return r.fulfill({json:{order,items,complete:true,history:[],additions:[],flowHistory}});
  const rows=(p.get('scope')==='delivered'?delivered:!delivered)?[order]:[];
  return r.fulfill({json:{rows,total:rows.length,users:[{email:'tech',name:'Técnico teste'}]}});
 });
 await page.goto('/almoxarifado');await page.getByRole('button',{name:'Entregues',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Ordens entregues'})).toBeVisible();
 await expect(page.getByRole('button',{name:/OS-15100/})).toHaveCount(0);
 await page.getByRole('button',{name:'Para entrega',exact:true}).click();await page.getByRole('button',{name:/OS-15100/}).click();
 await page.getByLabel('Funcionário que retirou',{exact:true}).selectOption('tech');await page.getByRole('checkbox',{name:'Selecionar todos os materiais'}).check();
 await page.getByRole('button',{name:'Registrar entrega dos selecionados'}).click();await expect(page.locator('.warehouse-success')).toContainText('Entrega registrada');
 await page.getByRole('button',{name:'Entregues',exact:true}).click();await page.getByRole('button',{name:/OS-15100/}).click();
 await page.getByRole('button',{name:'Alterar status do fluxo',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Alterar status do fluxo da OS'});
 await dialog.getByLabel('Novo status do fluxo',{exact:true}).selectOption('18');await dialog.getByRole('button',{name:'Salvar fluxo no M8'}).click();
 await expect(dialog).toHaveCount(0);expect(flowPost.flowId).toBe('18');expect(flowPost.expectedFlow).toBe('5');
 await expect(page.locator('.warehouse-success')).toContainText('Status do fluxo atualizado no M8.');
 await page.getByText('Histórico do status do fluxo (1)',{exact:true}).click();
 await expect(page.locator('.warehouse-history')).toContainText(['Material separado → Liberado para faturamento','Nenhuma movimentação registrada.']);
});
