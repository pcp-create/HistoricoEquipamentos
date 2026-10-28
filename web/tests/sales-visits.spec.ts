import sharp from "sharp";
import {pickDateTime} from "./helpers/pick-date-time";
import { test, expect } from "@playwright/test";
test.setTimeout(90000);

test.beforeEach(async({page})=>{
 await page.route('**/api/customer-contacts?*',r=>r.fulfill({json:{contacts:[{id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',name:'João',phone:'49999999999'}]}}));
 await page.route('**/api/customer-contacts',r=>r.fulfill({json:{contact:{id:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',...r.request().postDataJSON()}}}));
});
const purposes=[{id:'1',name:'Prospecção',description:'Identificar oportunidades.',active:true,version:1}];

test("sales portal displays portfolio, schedules visits and registers historical visits on mobile", async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: "m8-refresh", value: "test", domain: "localhost", path: "/" },
  ]);
  const customer = {
    key: "m8:1",
    name: "Cliente de teste",
    tradeName: "COOPERSULCA",
    equipment:[{id:"123",name:"Compressor de teste",model:"GA22",serial:"ABC"}],
    document: "123",
    city: "Lages",
    uf: "SC",
    address: "Rua Um",
    lead: false,
    latitude: null,
    longitude: null,
    lastVisit: null,
    health: "overdue",
  };
  await page.route('**/api/visits/machines*',r=>r.fulfill({json:{machines:[],equipment:customer.equipment}}));
  const writes: any[] = [];
  await page.route("**/api/visits", async (r) => {
    if (r.request().method() === "POST") {
      writes.push(r.request().postDataJSON());
      await r.fulfill({ json: { saved: true } });
    } else
      await r.fulfill({
        json: { purposes, canManage:true, name: "Vendedor teste", customers: [customer], visits: writes.filter(w => w.action === "schedule").map(w => ({...w, status: "scheduled", version: 1})) },
      });
  });
  await page.goto("/visitas");
  await expect(page.getByRole("heading", {name:"Seu dia em campo"})).toBeVisible();
  await expect(page.getByRole("button", {name:/Controle de Despesas Em breve/})).toBeDisabled();
  await expect(page.getByText("Indicação de Vendas",{exact:true})).toHaveCount(0);
  await expect(page.getByRole("link",{name:"Gestão de Visitas",exact:true})).toHaveCount(0);
  await page.getByRole("button", {name: /Visitas Sua carteira/}).click();
  await expect(
    page.getByRole("heading", { name: "Minhas visitas" }),
  ).toBeVisible();
  await expect(page.getByRole("link",{name:"Gestão de Visitas",exact:true})).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Visitas vencidas/ }),
  ).toContainText("1");
  await page
    .getByRole("button", { name: "Agendar visita", exact: true })
    .click();
  const fieldStyle = async (name:string) => page.getByRole("combobox",{name,exact:true}).evaluate(el=>{
    const style=getComputedStyle(el), placeholder=getComputedStyle(el,'::placeholder');
    return {font:style.fontFamily,size:style.fontSize,weight:style.fontWeight,color:style.color,border:style.borderColor,radius:style.borderRadius,placeholderColor:placeholder.color,placeholderWeight:placeholder.fontWeight};
  });
  expect(await fieldStyle("Finalidade da Visita")).toEqual(await fieldStyle("Cliente"));
  expect((await fieldStyle("Finalidade da Visita")).placeholderWeight).toBe("400");
  await page
    .getByRole("combobox", { name: "Cliente", exact: true })
    .click();
  await page.getByRole("combobox", { name: "Cliente", exact:true }).fill("COOPERSULCA");
  await page.getByRole("option", { name: /Cliente de teste/ }).click();
  await pickDateTime(page,"Data e hora agendada","2026-11-20T10:00");
  await page.getByRole('button',{name:'+ Novo contato',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'Novo contato',exact:true})).toBeVisible();
  expect(await page.getByRole('dialog',{name:'Novo contato',exact:true}).evaluate(el=>el.matches(':modal'))).toBe(true);
  await page.getByLabel('Nome do contato').fill('João');await page.getByLabel('Telefone do contato').fill('49999999999');
  await page.getByRole('button',{name:'Salvar contato',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'Novo contato',exact:true})).toHaveCount(0);
  await expect(page.getByLabel('Contato que receberá a visita')).toHaveValue('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
  await page.getByLabel('Agendar lembrete da tarefa para o vendedor').check();
  await pickDateTime(page,'Data e hora do alerta (Brasília)','2027-11-20T09:00');
  await page.getByRole("combobox",{name:"Finalidade da Visita",exact:true}).fill("Prospec");
 await page.getByRole("listbox").getByRole("option").first().click();
  await page.getByRole("button", { name: "Salvar agendamento" }).click();
  await expect(page.getByRole("status")).toContainText("Visita agendada");
  expect(writes[0].scheduled_at).toBe("2026-11-20T13:00:00.000Z");expect(writes[0].whatsappAt).toBe("2027-11-20T09:00");expect(writes[0].contact_id).toBe("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee");
  await page.getByRole("button", { name: "Calendário", exact: true }).click();
  await expect(page.locator(".field-calendar-heading")).toContainText("novembro de 2026");
  await expect(page.locator(".field-calendar-grid button[aria-pressed=true]")).toContainText("1 visita");
  await expect(page.locator(".sales-visit")).toContainText("Cliente de teste");
  await page.getByRole("button", { name: "Ver todo o mês" }).click();
  await expect(page.getByRole("heading", { name: "Agendadas no mês" })).toBeVisible();
  await page.getByRole("button", { name: "Lista", exact: true }).click();
  await expect(
    page.getByText("Cliente de teste", { exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.getByRole("button", { name: "Abrir ações de visita" }).click();
  await page
    .getByRole("button", { name: "Registrar visita realizada", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Cliente", exact: true })
    .click();
  await page.getByRole("combobox", { name: "Cliente", exact:true }).fill("Cliente de teste");
  await page.getByRole("option", { name: /Cliente de teste/ }).click();
  await pickDateTime(page,"Data e hora da realização","2026-01-15T14:00");
  await page.getByLabel("Contato que receberá a visita").selectOption("dddddddd-dddd-4ddd-8ddd-dddddddddddd");
  await page
    .getByLabel("Registro da visita e próximos passos")
    .fill("Cliente visitado, retornar com proposta.");
  await page.getByRole("combobox",{name:"Finalidade da Visita",exact:true}).fill("Prospec");
 await page.getByRole("listbox").getByRole("option").first().click();
  await page.locator('.visit-record-machines > summary').click();
  await page.route('**/api/visits/machines*',r=>r.fulfill({json:r.request().method()==='POST'?{taskId:'999'}:{machines:[]}}));
  await page.getByRole('button',{name:'Cadastrar máquina',exact:true}).click();
  const machineDialog=page.getByRole('dialog',{name:'Cadastrar máquina',exact:true});
  for(const [label,value] of [['Tipo de equipamento','Compressor'],['Modelo','GA22'],['Marca','Atlas'],['Número de série','ABC'],['Horímetro (h)','10']])await machineDialog.getByLabel(label,{exact:true}).fill(value);
  await machineDialog.getByRole('button',{name:'Salvar e gerar tarefa'}).click();
  await expect(machineDialog).toHaveCount(0);
  expect(writes).toHaveLength(1);
  await expect(page.getByLabel('Registro da visita e próximos passos')).toHaveValue('Cliente visitado, retornar com proposta.');
  await page.getByRole('checkbox',{name:/Compressor de teste/}).check();
  await page.getByLabel('Registro na máquina 123').fill('Verificado vazamento na conexão.');
  await page.getByLabel('Horímetro (h)',{exact:true}).fill('1234.5');
  await page.getByLabel('Data da coleta',{exact:true}).fill('2026-01-15');
  await page.getByLabel('Fotos da visita (até 6)').setInputFiles({name:'foto.png',mimeType:'image/png',buffer:await sharp({create:{width:16,height:16,channels:3,background:'white'}}).png().toBuffer()});
  await expect(page.getByAltText('Foto 1 da visita')).toBeVisible();
  await page.getByRole("button", { name: "Salvar visita realizada" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Visita realizada registrada",
  );
  expect(writes[1].action).toBe("history");
  expect(writes[1].machineRecords).toEqual([{equipment:'123',note:'Verificado vazamento na conexão.',meter:'1234.5',meterDate:'2026-01-15'}]);
  expect(writes[1].photos[0]).toMatch(/^data:image\/jpeg;base64,/);
  await expect(page.getByRole('dialog',{name:'Agendar próxima visita'})).toBeVisible();
  await page.getByRole('button',{name:'Agendar próxima visita',exact:true}).click();
  await expect(page.getByLabel('Data e hora agendada')).toHaveValue('');
  await expect(page.getByLabel('Finalidade da Visita',{exact:true})).toHaveValue('');
  await expect(page.getByLabel('Contato que receberá a visita')).toHaveValue('dddddddd-dddd-4ddd-8ddd-dddddddddddd');
  page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Fechar formulário',exact:true}).click();
  const tileReferrers: string[] = [];
  await page.route("https://tile.openstreetmap.org/**", async route => {
    const headers = await route.request().allHeaders();
    tileReferrers.push(headers.referer || "");
    await route.fulfill({contentType:"image/png",body:Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6zS8AAAAASUVORK5CYII=","base64")});
  });
  await page.getByRole("button", { name: "Mapa", exact: true }).click();
  await expect(page.getByText(/sem posição disponível/)).toBeVisible();
  await expect(page.locator(".leaflet-container")).toBeVisible();
  await expect.poll(() => tileReferrers.length).toBeGreaterThan(0);
  expect(tileReferrers.every(origin => origin === new URL(page.url()).origin + "/")).toBeTruthy();
  await expect(page.locator(".leaflet-tile").first()).toHaveAttribute("referrerpolicy", "origin");
});

test('map groups nearby customers, zooms apart and lists customers at identical coordinates',async({page,context})=>{
 await context.addCookies([{name:'m8-refresh',value:'test',domain:'localhost',path:'/'}]);
 const base={document:'',city:'Lages',uf:'SC',address:'',lead:false,lastVisit:null,health:'overdue',latitude:-27.8,longitude:-50.3};
 await page.route('**/api/visits',r=>r.fulfill({json:{purposes,name:'Vendedor teste',sellers:[{id:'seller',name:'Vendedor Teste',latitude:-27.81,longitude:-50.31,located_at:new Date().toISOString(),last_seen_at:new Date().toISOString(),online:true}],customers:[{...base,key:'1',name:'Cliente A',equipment:[{id:'100',name:'Compressor',model:'TPF100',serial:'SERIE100',meter:1234,meterDate:'2026-10-01',version:1}]},{...base,key:'2',name:'Cliente B',health:'current'},{...base,key:'3',name:'Cliente C',longitude:-50.299}],visits:[]}}));
 await page.route('https://tile.openstreetmap.org/**',r=>r.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6zS8AAAAASUVORK5CYII=','base64')}));
 await page.goto('/visitas');await page.getByRole('button',{name:/Visitas Sua carteira/}).click();await expect(page.getByRole('heading',{name:'Saúde da carteira'})).toBeVisible();await page.getByRole('button',{name:'Mapa',exact:true}).click();
 await expect(page.locator('.sales-seller-marker')).toHaveCount(1);
 const markers=page.locator('.sales-map-marker');await expect(markers).toHaveCount(1);await expect(markers.first()).toContainText('3');
 await markers.first().click();
 await page.waitForTimeout(700);
 for(let i=0;i<5 && await markers.count()===1;i++){
   await page.locator('.leaflet-control-zoom-in').click();
   await page.waitForTimeout(400);
 }
 await expect(markers).toHaveCount(2);
 await page.locator('.sales-map-marker[aria-label^="2 clientes"]').click();
 await expect(markers).toHaveCount(3);
 const a=await page.locator('.sales-map-marker[aria-label="Cliente A"]').boundingBox();
 const b=await page.locator('.sales-map-marker[aria-label="Cliente B"]').boundingBox();
 expect(Math.abs(a!.x-b!.x)).toBeGreaterThan(100);
 await page.locator('.sales-map-marker[aria-label="Cliente A"]').click();
 await expect(page.locator('.leaflet-popup-content')).toContainText('Cliente A');
 await expect(page.locator('.leaflet-popup-content')).toContainText('1 equipamento cadastrado');
 await page.getByRole('button',{name:'Ver equipamentos',exact:true}).click();
 await expect(page.locator('.sales-popup-equipment-list')).toBeVisible();
 await expect(page.locator('.sales-popup-equipment-list')).toContainText('SERIE100');
 await expect(page.locator('.sales-popup-equipment-list')).toContainText('1.234 h');
 await page.getByRole('button',{name:'Registrar horímetro atual',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'Registrar horímetro',exact:true})).toContainText('01/10/2026');
 await page.getByRole('button',{name:'Cancelar',exact:true}).click();

 await page.getByRole('button',{name:'Ocultar equipamentos',exact:true}).click();
 await expect(page.locator('.sales-popup-equipment-list')).toBeHidden();
 await expect(page.locator('.map-customer-label').filter({hasText:'Cliente C'})).toBeVisible();
 const map=page.locator('.sales-map');
 const before=await map.boundingBox();
 for(let i=0;i<3;i++){
   await page.getByLabel('Exibir nome do cliente').uncheck();
   await expect(page.locator('.map-customer-label').first()).toBeHidden();
   await expect(map).toHaveClass(/leaflet-container/);
   await page.getByLabel('Exibir nome do cliente').check();
   await expect(page.locator('.map-customer-label').first()).toBeVisible();
   await expect(map).toHaveClass(/leaflet-container/);
 }
 expect(await map.boundingBox()).toEqual(before);
 expect(await map.evaluate(el=>getComputedStyle(el).overflow)).toBe('hidden');
 await page.setViewportSize({width:390,height:844});
 await page.getByLabel('Exibir nome do cliente').uncheck();
 await page.getByLabel('Exibir nome do cliente').check();
 await expect(map).toHaveClass(/leaflet-container/);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
});

test('name visibility does not overwrite Leaflet container classes or change map bounds',async({page,context})=>{
 await context.addCookies([{name:'m8-refresh',value:'test',domain:'localhost',path:'/'}]);
 await page.route('**/api/visits',r=>r.fulfill({json:{purposes,name:'Vendedor',visits:[],customers:[{key:'1',name:'Cliente',document:'',city:'Lages',uf:'SC',address:'',lead:false,lastVisit:null,health:'overdue',latitude:-27.8,longitude:-50.3}]}}));
 await page.route('https://tile.openstreetmap.org/**',r=>r.abort());
 await page.goto('/visitas',{waitUntil:'domcontentloaded'});
 await page.getByRole('button',{name:/Visitas Sua carteira/}).click();
 await expect(page.getByRole('heading',{name:'Saúde da carteira'})).toBeVisible();
 await page.getByRole('button',{name:'Mapa',exact:true}).click();
 const map=page.locator('.sales-map');await expect(map).toHaveClass(/leaflet-container/);
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:844});
  const before=await map.boundingBox();
  await page.getByLabel('Exibir nome do cliente').uncheck();
  await expect(page.locator('.map-customer-label').first()).toBeHidden();
  await page.getByLabel('Exibir nome do cliente').check();
  await expect(page.locator('.map-customer-label').first()).toBeVisible();
  await expect(map).toHaveClass(/leaflet-container/);
  expect(await map.boundingBox()).toEqual(before);
  expect(await map.evaluate(el=>getComputedStyle(el).overflow)).toBe('hidden');
 }
});

test('selected customer mini map saves a manual location without losing the visit form', async ({page,context}) => {
 await context.addCookies([{name:'m8-refresh',value:'test',domain:'localhost',path:'/'}]);
 let customer={key:'m8:1',name:'Cliente mapa',document:'123',city:'Lages',uf:'SC',address:'',lead:false,lastVisit:null,health:'overdue',latitude:-27.8,longitude:-50.3,locationVersion:0};
 const writes:any[]=[];
 await page.route('**/api/activity',r=>r.fulfill({json:{}}));
 await page.route('https://tile.openstreetmap.org/**',r=>r.abort());
 await page.route('**/api/visits',r=>{
   if(r.request().method()==='POST'){const b=r.request().postDataJSON();writes.push(b);customer={...customer,latitude:b.latitude,longitude:b.longitude,locationVersion:1};return r.fulfill({json:{saved:true}});}
   return r.fulfill({json:{purposes,name:'Vendedor',customers:[customer],visits:[]}});
 });
 await page.goto('/visitas');await page.getByRole('button',{name:/Visitas Sua carteira/}).click();await expect(page.getByRole('heading',{name:'Saúde da carteira'})).toBeVisible();
 await page.getByRole('button',{name:'Agendar visita',exact:true}).click();
 await page.getByRole('combobox',{name:'Cliente',exact:true}).click();
 await page.route('**/api/visits/location-search',r=>r.fulfill({json:{address:{city:'Lages',uf:'SC',address:r.request().postDataJSON().latitude===-27.8?'Rua identificada, 100':'Rua do novo ponto, 200'}}}));
 await page.getByRole('option',{name:/Cliente mapa/}).click();
 await expect(page.getByRole('region',{name:'Endereço do cliente',exact:true})).toContainText('Rua identificada, 100');
 await expect(page.locator('.sales-customer-mini-map')).toHaveClass(/leaflet-container/);
 await page.getByRole('button',{name:'+ Novo contato',exact:true}).click();await page.getByLabel('Nome do contato').fill('Contato preservado');
 await page.getByRole('button',{name:'Alterar localização',exact:true}).click();
 const mapBox=await page.locator('.sales-customer-mini-map').boundingBox();
 const pinBefore=await page.locator('.sales-location-center').boundingBox();
 await page.mouse.move(mapBox!.x+mapBox!.width/2,mapBox!.y+mapBox!.height/2);
 await page.mouse.down();await page.mouse.move(mapBox!.x+mapBox!.width/2+90,mapBox!.y+mapBox!.height/2+40,{steps:12});await page.mouse.up();
 await expect(page.getByRole('region',{name:'Endereço do cliente',exact:true})).toContainText('Rua do novo ponto, 200');
 const pinAfter=await page.locator('.sales-location-center').boundingBox();
 expect(pinAfter!.x).toBeCloseTo(pinBefore!.x,0);expect(pinAfter!.y).toBeCloseTo(pinBefore!.y,0);
 await page.getByRole('button',{name:'Salvar localização',exact:true}).click();
 await expect(page.getByRole('button',{name:'Alterar localização',exact:true})).toBeVisible();
 expect(writes).toHaveLength(1);expect(writes[0].action).toBe('location');expect(writes[0].customer_key).toBe('m8:1');
 expect(writes[0].latitude).not.toBe(-27.8);
 await expect(page.getByRole('region',{name:'Endereço do cliente',exact:true})).toContainText('Rua do novo ponto, 200');
 await expect(page.getByLabel('Nome do contato')).toHaveValue('Contato preservado');
});

test('new lead searches a city and submits its selected map position',async({page,context})=>{
 await context.addCookies([{name:'m8-refresh',value:'test',domain:'localhost',path:'/'}]);
 const writes:any[]=[];
 await page.route('**/api/activity',r=>r.fulfill({json:{}}));
 await page.route('https://tile.openstreetmap.org/**',r=>r.abort());
 await page.route('**/api/visits',r=>{if(r.request().method()==='POST'){writes.push(r.request().postDataJSON());return r.fulfill({json:{saved:true}})}return r.fulfill({json:{purposes,name:'Vendedor',customers:[],visits:[]}})});
 await page.route('**/api/visits/location-search',r=>r.fulfill({json:r.request().postDataJSON().action==='reverse'?{address:{city:'Rio do Sul',uf:'SC',address:'Rua XV de Novembro, 100, Centro'}}:{results:[{label:'Lages, SC, Brasil',latitude:-27.8,longitude:-50.3}]}}));
 await page.goto('/visitas');await page.getByRole('button',{name:/Visitas Sua carteira/}).click();await expect(page.getByRole('heading',{name:'Saúde da carteira'})).toBeVisible();
 await page.getByRole('button',{name:'Agendar visita',exact:true}).click();
 await page.getByLabel('Novo cliente fora da base (Lead)').check();
 await page.getByLabel('Nome do Lead').fill('Lead mapa');
 await expect(page.locator('.sales-customer-mini-map')).toHaveClass(/leaflet-container/);
 await page.getByLabel('Buscar endereço ou cidade').fill('Lages SC');
 await page.getByRole('button',{name:'Buscar no mapa',exact:true}).click();
 await page.getByRole('button',{name:'Lages, SC, Brasil',exact:true}).click();
 await expect(page.locator('.sales-location-center')).toBeVisible();
 await page.evaluate(()=>{navigator.geolocation.getCurrentPosition=(_success,error)=>error?.({code:1,message:'Denied'} as GeolocationPositionError)});
 await page.getByRole('button',{name:'Usar localização atual',exact:true}).click();
 await expect(page.locator('.sales-customer-location').getByRole('alert')).toContainText('Permita o acesso');
 await page.evaluate(()=>{navigator.geolocation.getCurrentPosition=success=>success({coords:{latitude:-27.81,longitude:-50.31,accuracy:5}} as GeolocationPosition)});
 await page.getByRole('button',{name:'Usar localização atual',exact:true}).click();
 await expect(page.locator('.sales-customer-location').getByRole('alert')).toHaveCount(0);
 await expect(page.getByRole('region',{name:'Endereço do Lead'})).toContainText('Rio do Sul / SC');
 await expect(page.getByLabel('Cidade',{exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Editar endereço',exact:true}).click();
 await expect(page.getByLabel('Cidade',{exact:true})).toHaveValue('Rio do Sul');
 await expect(page.getByLabel('UF',{exact:true})).toHaveValue('SC');
 await expect(page.getByLabel('Endereço',{exact:true})).toHaveValue('Rua XV de Novembro, 100, Centro');
 await pickDateTime(page,"Data e hora agendada",'2026-11-20T10:00');
 await page.getByLabel('Nome do contato').fill('João');
 await page.getByLabel('Telefone do contato').fill('49999999999');
 await page.getByRole("combobox",{name:"Finalidade da Visita",exact:true}).fill("Prospec");
 await page.getByRole("listbox").getByRole("option").first().click();
 await page.getByRole('button',{name:'Salvar agendamento',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('Visita agendada');
 expect(writes[0].lead.location).toEqual({latitude:-27.81,longitude:-50.31});
 expect(writes[0].lead).toMatchObject({city:'Rio do Sul',uf:'SC',address:'Rua XV de Novembro, 100, Centro'});
});

test('user without territory schedules an external customer with a purpose',async({page,context})=>{
 await context.addCookies([{name:'m8-refresh',value:'test',domain:'localhost',path:'/'}]);
 let saved:any;
 await page.route('**/api/activity',r=>r.fulfill({json:{}}));
 await page.route('**/api/visits',r=>{if(r.request().method()==='POST'){saved=r.request().postDataJSON();return r.fulfill({json:{saved:true}})}return r.fulfill({json:{purposes,name:'Técnico',customers:[],visits:[]}})});
 await page.route('**/api/visits/customers*',r=>r.fulfill({json:{rows:[{id:'m8:99',name:'Cliente fora da carteira',data:{key:'m8:99',name:'Cliente fora da carteira',city:'Lages',uf:'SC',lead:false}}],customers:[{key:'m8:99',name:'Cliente fora da carteira',document:'99',city:'Lages',uf:'SC',address:'',latitude:null,longitude:null,lead:false,lastVisit:null,health:'overdue'}]}}));
 await page.route('https://tile.openstreetmap.org/**',r=>r.abort());
 await page.goto('/visitas');await page.getByRole('button',{name:/Visitas Sua carteira/}).click();
 await page.getByRole('button',{name:'Agendar visita',exact:true}).click();
 await page.getByRole('combobox',{name:'Cliente',exact:true}).click();
 await page.getByLabel('Base completa de clientes',{exact:true}).check();
 await expect(page.getByRole('combobox',{name:'Cliente',exact:true})).toHaveAttribute('aria-expanded','true');
 await expect(page.getByRole('status').filter({hasText:'Carregando clientes'})).toHaveCount(0);
 await page.getByRole('combobox',{name:'Cliente',exact:true}).click();
 await page.getByRole('option',{name:/Cliente fora da carteira/}).click();
 await pickDateTime(page,"Data e hora agendada",'2026-11-20T10:00');
 await page.getByRole("combobox",{name:"Finalidade da Visita",exact:true}).fill("Prospec");
 await page.getByRole("listbox").getByRole("option").first().click();
 await page.getByLabel('Contato que receberá a visita').selectOption('dddddddd-dddd-4ddd-8ddd-dddddddddddd');
 await page.getByRole('button',{name:'Salvar agendamento',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('Visita agendada');
 expect(saved).toMatchObject({customer_key:'m8:99',purpose_id:'1'});
});

test('visit purpose settings edits and adds options',async({page,context})=>{
 await context.addCookies([{name:'m8-refresh',value:'test',domain:'localhost',path:'/'}]);
 let rows=[...purposes];
 await page.route('**/api/visits/settings',r=>{if(r.request().method()==='POST'){const batch=r.request().postDataJSON();for(const b of batch.purposes){rows=b.id?rows.map(x=>x.id===b.id?{...b,version:b.version+1}:x):[...rows,{...b,id:'2',version:1}];}return r.fulfill({json:{saved:true}})}return r.fulfill({json:{purposes:rows}})});
 await page.goto('/visitas/gestao/configuracoes');
 await expect(page.getByRole('heading',{name:'Configurações de Visitas'})).toBeVisible();
 await page.getByLabel('Finalidade 1',{exact:true}).fill('Prospecção atualizada');
 await page.getByRole('button',{name:'Salvar configurações',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('Configurações salvas');
 expect(rows[0].name).toBe('Prospecção atualizada');
 await page.getByRole('button',{name:'Adicionar finalidade'}).click();
 await page.getByLabel('Finalidade 2',{exact:true}).fill('Treinamento');
 await page.getByLabel('Descrição 2',{exact:true}).fill('Treinamento no cliente');
 await page.getByRole('button',{name:'Salvar configurações',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('Configurações salvas');
 expect(rows[1].name).toBe('Treinamento');
});

test('lead separation, week/day calendar and visit task demand',async({page,context})=>{
 await context.addCookies([{name:'m8-refresh',value:'test',domain:'localhost',path:'/'}]);
 const customer={key:'m8:1',name:'Cliente carteira',document:'1',city:'Lages',uf:'SC',address:'',lead:false,in_portfolio:true,health:'overdue',latitude:null,longitude:null,lastVisit:null};
 const lead={...customer,key:'lead:1',name:'Lead separado',lead:true,in_portfolio:false};
 const visit={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',customer_key:'m8:1',seller:'a@test',scheduled_at:'2026-10-23T13:00:00Z',completed_at:null,contact:'João',phone:'49999999999',description:'Preparar proposta de manutenção',outcome:'',purpose_name:'Prospecção',status:'scheduled',version:1};
 let demand:any;
 await page.route('**/api/activity',r=>r.fulfill({json:{}}));
 await page.route('**/api/visits',r=>{if(r.request().method()==='POST'){demand=r.request().postDataJSON();return r.fulfill({json:{taskId:'123'}})}return r.fulfill({json:{name:'Vendedor',customers:[customer,lead],visits:[visit],purposes}})});
 await page.route('**/api/tasks',r=>r.fulfill({json:{users:[{email:'tech@test',display_name:'Técnico'}]}}));
 await page.goto('/visitas');await page.getByRole('button',{name:/Visitas Sua carteira/}).click();
 await expect(page.getByRole('button',{name:/Clientes na carteira/})).toContainText('1');
 await expect(page.getByRole('button',{name:/Visitas vencidas/})).toContainText('1');
 await page.getByRole('button',{name:'Lista',exact:true}).click();
 await expect(page.locator('.sales-customer-grid')).not.toContainText('Lead separado');
 await page.getByRole('button',{name:'Leads (1)',exact:true}).click();
 await expect(page.locator('.sales-customer-grid')).toContainText('Lead separado');
 await expect(page.locator('.sales-customer-grid')).not.toContainText('Cliente carteira');
 await page.getByRole('button',{name:'Calendário',exact:true}).click();
 await page.getByRole('button',{name:'Semana',exact:true}).click();
 await page.getByLabel('Data do calendário').fill('2026-10-23');
 await expect(page.locator('.visit-period-grid>section')).toHaveCount(7);
 await expect(page.locator('.visit-period-grid')).toContainText('Preparar proposta de manutenção');
 await page.getByRole('button',{name:'Dia',exact:true}).click();
 await expect(page.locator('.visit-period-grid>section')).toHaveCount(1);
 await page.getByRole('button',{name:'Criar tarefa da visita',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Criar tarefa da visita'});
 await expect(dialog.getByLabel('Título',{exact:true})).toHaveValue('Visita - Cliente carteira - Prospecção');
 await expect(dialog.getByLabel('Descrição',{exact:true})).toHaveValue(/Preparar proposta de manutenção/);
 await dialog.getByLabel('Responsável').selectOption('tech@test');await dialog.getByLabel('Prioridade').selectOption('high');await dialog.getByLabel('Vencimento').fill('2026-11-01');
 await dialog.getByRole('button',{name:'Criar tarefa',exact:true}).click();
 await expect(page.getByRole('link',{name:'Abrir tarefa TAR-123'})).toBeVisible();
 expect(demand).toMatchObject({action:'task',visitId:visit.id,assignedTo:'tech@test',priority:'high',dueDate:'2026-11-01'});
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Semana',exact:true}).click();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
});

test('customer list opens machines and records meter; mobile history actions stay compact',async({page,context})=>{
 await context.addCookies([{name:'m8-refresh',value:'test',domain:'localhost',path:'/'}]);
 const equipment={id:'100',name:'Compressor',model:'GA15',serial:'ABC',meter:1200,meterDate:'2026-10-01',version:1};
 const customer={key:'m8:1',name:'Cliente máquinas',document:'1',city:'Lages',uf:'SC',address:'Rua Um',lead:false,health:'overdue',latitude:-27.8,longitude:-50.3,lastVisit:null,equipment:[equipment]};
 const visit={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',customer_key:customer.key,scheduled_at:'2099-10-23T13:00:00Z',contact:'João',phone:'49999999999',status:'scheduled',version:1,description:'Inspeção',outcome:''};
 let saved:any;
 await page.route('**/api/activity',r=>r.fulfill({json:{}}));
 await page.route('https://tile.openstreetmap.org/**',r=>r.abort());
 await page.route('**/api/visits',r=>{if(r.request().method()==='POST'){saved=r.request().postDataJSON();equipment.meter=saved.meter;return r.fulfill({json:{saved:true}})}return r.fulfill({json:{name:'Vendedor',customers:[customer],visits:[visit],purposes}})});
 await page.goto('/visitas');await page.getByRole('button',{name:/Visitas Sua carteira/}).click();
 await page.setViewportSize({width:390,height:844});
 await page.getByRole('button',{name:'Lista',exact:true}).click();
 await page.getByRole('button',{name:/Máquinas do cliente \(1\)/}).click();
 const machines=page.getByRole('region',{name:'Máquinas de Cliente máquinas'});
 await expect(machines).toContainText('1.200 h');await expect(machines).toContainText('ABC');
 await machines.getByRole('button',{name:'Registrar horímetro',exact:true}).click();
 const meter=page.getByRole('dialog',{name:'Registrar horímetro',exact:true});
 await meter.getByLabel('Horímetro atual (h)').fill('1300');await meter.getByLabel('Data da coleta').fill('2026-10-01');
 await meter.getByRole('button',{name:'Salvar horímetro',exact:true}).click();
 await expect(meter).toHaveCount(0);await expect(machines).toContainText('1.300 h');expect(saved).toMatchObject({action:'meter',customer_key:'m8:1',equipment:'100',meter:1300});
 await page.getByRole('button',{name:'Histórico',exact:true}).click();
 const history=page.getByRole('dialog',{name:'Histórico do cliente'});
 await history.locator('.sales-visit summary').click();
 await expect(history.getByRole('button',{name:'Cancelar visita',exact:true})).toHaveCSS('color','rgb(180, 35, 53)');
 const close=history.getByRole('button',{name:'Fechar histórico'});expect((await close.boundingBox())!.width).toBeLessThanOrEqual(40);
 await close.click();await page.getByRole('button',{name:'Mapa',exact:true}).click();
 await expect(page.locator('[data-scheduled] svg')).toHaveCount(1);
 await expect(page.getByText('Legenda do mapa',{exact:true})).toBeVisible();
 await page.getByText('Como usar o mapa e localização',{exact:true}).click();
 await expect(page.getByText('Os números nos marcadores indicam clientes agrupados. Clique para ampliar ou consultar.')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 await page.screenshot({path:'/tmp/visitas-mapa-mobile.png',fullPage:true});
});

for(const lead of [false,true])test(`customer machine registration creates task and displays pending machine (lead=${lead})`,async({page,context})=>{
 await context.addCookies([{name:'m8-refresh',value:'test',domain:'localhost',path:'/'}]);
 await page.route('**/api/visits',r=>r.fulfill({json:{name:'Vendedor',customers:[{key:lead?'lead:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa':'m8:1',name:'Cliente sem máquina',document:'123',city:'Lages',uf:'SC',address:'',lead,in_portfolio:!lead,latitude:null,longitude:null,lastVisit:null,health:'overdue',equipment:[]}],visits:[],purposes}}));
 let machines:any[]=[];let payload:any;
 await page.route('**/api/visits/machines*',r=>{if(r.request().method()==='POST'){payload=r.request().postDataJSON();machines=[{id:payload.requestId,equipment_type:payload.equipmentType,model:payload.model,brand:payload.brand,serial:payload.serial,meter:payload.meter,observations:payload.observations,task_id:'321'}];return r.fulfill({json:{taskId:'321'}})}return r.fulfill({json:{machines}})});
 await page.goto('/visitas');await page.getByRole('button',{name:/Visitas Sua carteira/}).click();
 await page.getByRole('button',{name:'Lista',exact:true}).click();
 if(lead)await page.getByRole('button',{name:/^Leads/}).click();
 await page.getByRole('button',{name:/Máquinas do cliente \(0\)/}).click();
 await page.getByRole('button',{name:'Cadastrar máquina',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Cadastrar máquina'});
 await expect(dialog).toContainText('Cliente sem máquina');
 for(const [label,value] of [['Tipo de equipamento','Compressor'],['Modelo','GA22'],['Marca','Atlas Copco'],['Número de série','ABC123'],['Horímetro (h)','1200']])await dialog.getByLabel(label,{exact:true}).fill(value);
 await dialog.getByLabel('Observações',{exact:true}).fill('Máquina com vazamento de óleo.');
 await dialog.getByRole('button',{name:'Salvar e gerar tarefa'}).click();
 await expect(dialog).toHaveCount(0);await expect(page.getByText('Cadastro pendente',{exact:true})).toBeVisible();
 await expect(page.getByRole('link',{name:'Tarefa TAR-321'})).toHaveAttribute('href','/tarefas?task=321');
 await expect(page.getByText('Máquina com vazamento de óleo.',{exact:false})).toBeVisible();
 expect(payload.observations).toBe('Máquina com vazamento de óleo.');
 expect(payload.customer).toBe(lead?'lead:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa':'m8:1');expect(payload.requestId).toMatch(/^[a-f0-9-]{36}$/);
});

test('mobile navigation stays at bottom and floating button expands visit actions',async({page,context})=>{
 await page.setViewportSize({width:390,height:844});
 await context.addCookies([{name:'m8-refresh',value:'test',domain:'localhost',path:'/'}]);
 await page.route('**/api/visits',r=>r.fulfill({json:{name:'Vendedor',customers:[],visits:[],purposes}}));
 await page.goto('/visitas');await page.getByRole('button',{name:/Visitas Sua carteira/}).click();
 const nav=page.getByRole('navigation',{name:'Visões de visitas'});
 await expect(nav).toHaveCSS('position','fixed');
 const bounds=await nav.boundingBox();expect(bounds!.y+bounds!.height).toBeCloseTo(844,0);
 await page.getByRole('button',{name:'Abrir ações de visita'}).click();
 await expect(page.getByRole('button',{name:'Fechar ações de visita'})).toHaveAttribute('aria-expanded','true');
 await page.locator('.sales-quick-options').getByRole('button',{name:'Agendar visita',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Agendar visita',exact:true})).toBeVisible();
 await expect(page.locator('.sales-quick-options')).toHaveCount(0);
});

test('full customer base finds COOPERSULCA by trade name on the visits page', async ({page,context}) => {
  await context.addCookies([{name:'m8-refresh',value:'test',domain:'localhost',path:'/'}]);
  await page.setViewportSize({width:454,height:803});
  await page.route('**/api/visits',r=>r.fulfill({json:{purposes,canManage:true,name:'Teste',customers:[],visits:[]}}));
  const directoryCustomers = [
    {key:'m8:28667',name:'COOPERATIVA REGIONAL AGROPECUARIA SUL CATARINENSE',tradeName:'COOPERSULCA',city:'TURVO',uf:'SC',document:'86512647002595',lead:false},
    {key:'m8:28672',name:'COOPERATIVA REGIONAL AGROPECUARIA SUL CATARINENSE',tradeName:'COOPERSULCA',city:'TORRES',uf:'RS',document:'86512647003303',lead:false}
  ];
  await page.route('**/api/visits/customers*',r=>r.fulfill({json:new URL(r.request().url()).searchParams.has('q')
    ? {rows:directoryCustomers.map(c=>({id:c.key,displayId:c.key.slice(3),name:c.name,tradeName:c.tradeName,detail:`${c.city}/${c.uf} · ${c.document}`,data:c}))}
    : {customers:directoryCustomers}}));
  await page.goto('/visitas?module=visitas');
  await page.getByRole('button',{name:/Visitas Sua carteira/}).click();
  await page.getByRole('button',{name:'Abrir ações de visita'}).click();
  await page.getByRole('button',{name:'Agendar visita',exact:true}).click();
  await page.getByRole('combobox',{name:'Cliente',exact:true}).click();
  await page.getByRole('checkbox',{name:'Base completa de clientes'}).check();
  await page.getByRole('combobox',{name:'Cliente',exact:true}).fill('coopersulca');
  await expect(page.getByRole('listbox').getByRole('option')).toHaveCount(2);
  await expect(page.locator('.order-choice-trade-name')).toHaveText(['COOPERSULCA','COOPERSULCA']);
  await page.screenshot({path:'/tmp/visitas-coopersulca.png'});
  await page.getByRole('option').filter({hasText:'28667'}).click();
  await expect(page.getByRole('combobox',{name:'Cliente',exact:true})).toHaveValue(/COOPERSULCA/);
});

for (const status of ['scheduled','completed'] as const) {
 test(`portal edits an existing ${status} visit`,async({page,context})=>{
  await context.addCookies([{name:'m8-refresh',value:'test',domain:'localhost',path:'/'}]);
  const customer={key:'m8:1',name:'Cliente técnico',document:'',city:'Lages',uf:'SC',lead:false,health:'overdue',latitude:null,longitude:null,lastVisit:null};
  let visit={id:'11111111-1111-4111-8111-111111111111',customer_key:customer.key,status,version:1,scheduled_at:'2026-01-10T12:00:00Z',completed_at:status==='completed'?'2026-01-10T13:00:00Z':null,contact:'Contato antigo',phone:'49999999999',description:'Objetivo original',outcome:status==='completed'?'Registro original':'',purpose_id:'1'};
  let saved:any;
  await page.route('**/api/visits',async r=>{
   if(r.request().method()==='POST') {saved=r.request().postDataJSON();visit={...visit,...saved,version:2};await r.fulfill({json:{saved:true}});}
   else await r.fulfill({json:{name:'Técnico',canEditVisits:true,purposes,customers:[customer],visits:[visit]}});
  });
  await page.goto('/visitas');
  await page.getByRole('button',{name:/Visitas Sua carteira/}).click();
  await page.getByRole('button',{name:'Lista',exact:true}).click();
  await page.getByRole('button',{name:'Visitas (1)',exact:true}).click();
  await expect(page.locator('.sales-visit summary')).toContainText('Cliente técnico');
  await expect(page.locator('.sales-visit').getByRole('button',{name:'Editar',exact:true})).toBeHidden();
  await page.locator('.sales-visit summary').click();
  if(status==='scheduled'){
    await page.setViewportSize({width:390,height:844});
    const editBox=await page.locator('.sales-visit').getByRole('button',{name:'Editar',exact:true}).boundingBox();
    const completeBox=await page.locator('.sales-visit').getByRole('button',{name:'Registrar realização',exact:true}).boundingBox();
    expect(Math.abs(editBox!.y-completeBox!.y)).toBeLessThan(1);
    expect(editBox!.x).toBeGreaterThan(completeBox!.x);
  }
  await page.locator('.sales-visit').getByRole('button',{name:'Editar',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Editar visita',exact:true});
  await dialog.getByLabel('Pessoa de contato').fill('Contato corrigido');
  await dialog.getByRole('button',{name:'Salvar alterações'}).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('.sales-visit')).toContainText('Contato corrigido');
  expect(saved).toMatchObject({action:'admin_edit',id:visit.id,version:1,contact:'Contato corrigido',outcome:visit.outcome});
 });
}

test("expired seller session offers a route back to sign in", async ({page, context}) => {
  await context.addCookies([{name:"m8-refresh",value:"expired",domain:"localhost",path:"/"}]);
  await page.route("**/api/visits", r => r.fulfill({status:401,json:{error:"Sessão expirada."}}));
  await page.goto("/visitas");
  await expect(page.getByRole("alert").filter({hasText:"Sua sessão expirou"})).toContainText("Entre novamente para continuar");
  await expect(page.getByRole("link",{name:"Entrar novamente"})).toHaveAttribute("href","/vendas/entrar");
  await page.getByRole("link",{name:"Entrar novamente"}).click();
  await expect(page).toHaveURL(/\/vendas\/entrar$/);
});

test('new lead stages machines before saving the visit and retains them after a failed save',async({page,context})=>{
 await context.addCookies([{name:'m8-refresh',value:'test',domain:'localhost',path:'/'}]);
 const purposes=[{id:'1',name:'Prospecção',description:'',active:true,version:1}];
 const writes:any[]=[];let machineWrites=0,fail=true;
 await page.route('**/api/visits/machines**',r=>{if(r.request().method()==='POST')machineWrites++;return r.fulfill({json:{machines:[],equipment:[]}})});
 await page.route('**/api/visits',r=>{if(r.request().method()==='GET')return r.fulfill({json:{name:'Vendedor',purposes,customers:[],visits:[]}});writes.push(r.request().postDataJSON());if(fail){fail=false;return r.fulfill({status:400,json:{error:'Confira o cadastro antes de salvar.'}})}return r.fulfill({json:{saved:true}})});
 await page.route('https://tile.openstreetmap.org/**',r=>r.abort());
 await page.goto('/visitas');
 await page.getByRole('button',{name:/Visitas Sua carteira/}).click();
 await page.getByRole('button',{name:'Agendar visita',exact:true}).click();
 const form=page.getByRole('dialog',{name:'Formulário de visita'});
 await form.getByLabel('Novo cliente fora da base (Lead)').check();
 await form.getByLabel('Nome do Lead',{exact:true}).fill('Lead com máquinas');
 await form.getByRole('button',{name:'Editar endereço',exact:true}).click();
 await form.getByLabel('Cidade',{exact:true}).fill('Lages');
 await form.getByLabel('Nome do contato').fill('Contato Lead');
 await form.getByLabel('Telefone do contato').fill('49999999999');
 await pickDateTime(page,'Data e hora agendada','2026-11-20T10:00');
 await form.getByRole('combobox',{name:'Finalidade da Visita',exact:true}).fill('Prospec');
 await form.getByRole('listbox').getByRole('option').first().click();
 for(const model of ['GA22','GA30']){
  await form.getByRole('button',{name:'Cadastrar máquina',exact:true}).click();
  const machine=page.getByRole('dialog',{name:'Cadastrar máquina',exact:true});
  await machine.getByLabel('Tipo de equipamento').fill('Compressor');
  await machine.getByLabel('Modelo',{exact:true}).fill(model);
  await machine.getByLabel('Marca',{exact:true}).fill('Atlas Copco');
  await machine.getByLabel('Número de série').fill('SERIE-'+model);
  await machine.getByLabel('Horímetro (h)').fill('100');
  await machine.getByRole('button',{name:'Adicionar ao Lead',exact:true}).click();
  await expect(machine).toHaveCount(0);
 }
 expect(writes).toHaveLength(0);expect(machineWrites).toBe(0);
 await form.getByRole('button',{name:'Remover máquina GA30',exact:true}).click();
 await expect(form).toContainText('Máquinas do novo Lead (1)');
 await form.getByRole('button',{name:'Salvar agendamento',exact:true}).click();
 await expect(form.getByRole('alert')).toContainText('Confira o cadastro');
 await expect(form).toContainText('Compressor - GA22');
 await form.getByRole('button',{name:'Salvar agendamento',exact:true}).click();
 await expect(form).toHaveCount(0);
 expect(writes).toHaveLength(2);expect(machineWrites).toBe(0);
 expect(writes[1].newMachines).toHaveLength(1);
 expect(writes[1].newMachines[0]).toMatchObject({equipmentType:'Compressor',model:'GA22',brand:'Atlas Copco',serial:'SERIE-GA22',meter:'100'});
 expect(writes[1].newMachines[0].requestId).toBe(writes[0].newMachines[0].requestId);
 expect(writes[1].lead.name).toBe('Lead com máquinas');
});
