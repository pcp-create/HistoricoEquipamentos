import { test, expect } from "@playwright/test";
test.setTimeout(90000);
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
  const writes: any[] = [];
  await page.route("**/api/visits", async (r) => {
    if (r.request().method() === "POST") {
      writes.push(r.request().postDataJSON());
      await r.fulfill({ json: { saved: true } });
    } else
      await r.fulfill({
        json: { name: "Vendedor teste", customers: [customer], visits: writes.filter(w => w.action === "schedule").map(w => ({...w, status: "scheduled", version: 1})) },
      });
  });
  await page.goto("/visitas");
  await expect(page.getByRole("heading", {name:"Seu dia em campo"})).toBeVisible();
  await expect(page.getByRole("button", {name:/Controle de Despesas Em breve/})).toBeDisabled();
  await expect(page.getByText("Indicação de Vendas",{exact:true})).toHaveCount(0);
  await page.getByRole("button", {name: /Visitas Sua carteira/}).click();
  await expect(
    page.getByRole("heading", { name: "Minhas visitas" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Visitas vencidas/ }),
  ).toContainText("1");
  await page
    .getByRole("button", { name: "Agendar visita", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Cliente", exact: true })
    .click();
  await page.getByRole("searchbox", { name: "Pesquisar cliente" }).fill("Cliente de teste");
  await page.getByRole("option", { name: /Cliente de teste/ }).click();
  await page.getByLabel("Data e hora agendada").fill("2026-11-20T10:00");
  await page.getByLabel("Pessoa que receberá").fill("João");
  await page.getByLabel("Telefone de contato").fill("49999999999");
  await page.getByRole("button", { name: "Salvar agendamento" }).click();
  await expect(page.getByRole("status")).toContainText("Visita agendada");
  expect(writes[0].scheduled_at).toBe("2026-11-20T13:00:00.000Z");
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
  await page
    .getByRole("button", { name: "Registrar visita realizada", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Cliente", exact: true })
    .click();
  await page.getByRole("searchbox", { name: "Pesquisar cliente" }).fill("Cliente de teste");
  await page.getByRole("option", { name: /Cliente de teste/ }).click();
  await page.getByLabel("Data e hora da realização").fill("2026-01-15T14:00");
  await page.getByLabel("Pessoa que receberá").fill("João");
  await page.getByLabel("Telefone de contato").fill("49999999999");
  await page
    .getByLabel("Registro da visita e próximos passos")
    .fill("Cliente visitado, retornar com proposta.");
  await page.getByRole("button", { name: "Salvar visita realizada" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Visita realizada registrada",
  );
  expect(writes[1].action).toBe("history");
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
 await page.route('**/api/visits',r=>r.fulfill({json:{name:'Vendedor teste',sellers:[{id:'seller',name:'Vendedor Teste',latitude:-27.81,longitude:-50.31,located_at:new Date().toISOString(),last_seen_at:new Date().toISOString(),online:true}],customers:[{...base,key:'1',name:'Cliente A',equipment:[{id:'100',name:'Compressor',model:'TPF100',serial:'SERIE100',meter:1234,meterDate:'2026-10-01',version:1}]},{...base,key:'2',name:'Cliente B',health:'current'},{...base,key:'3',name:'Cliente C',longitude:-50.299}],visits:[]}}));
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
 await page.route('**/api/visits',r=>r.fulfill({json:{name:'Vendedor',visits:[],customers:[{key:'1',name:'Cliente',document:'',city:'Lages',uf:'SC',address:'',lead:false,lastVisit:null,health:'overdue',latitude:-27.8,longitude:-50.3}]}}));
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
 let customer={key:'m8:1',name:'Cliente mapa',document:'123',city:'Lages',uf:'SC',address:'Rua Um',lead:false,lastVisit:null,health:'overdue',latitude:-27.8,longitude:-50.3,locationVersion:0};
 const writes:any[]=[];
 await page.route('**/api/activity',r=>r.fulfill({json:{}}));
 await page.route('https://tile.openstreetmap.org/**',r=>r.abort());
 await page.route('**/api/visits',r=>{
   if(r.request().method()==='POST'){const b=r.request().postDataJSON();writes.push(b);customer={...customer,latitude:b.latitude,longitude:b.longitude,locationVersion:1};return r.fulfill({json:{saved:true}});}
   return r.fulfill({json:{name:'Vendedor',customers:[customer],visits:[]}});
 });
 await page.goto('/visitas');await page.getByRole('button',{name:/Visitas Sua carteira/}).click();await expect(page.getByRole('heading',{name:'Saúde da carteira'})).toBeVisible();
 await page.getByRole('button',{name:'Agendar visita',exact:true}).click();
 await page.getByRole('combobox',{name:'Cliente',exact:true}).click();
 await page.getByRole('option',{name:/Cliente mapa/}).click();
 await expect(page.locator('.sales-customer-mini-map')).toHaveClass(/leaflet-container/);
 await page.getByLabel('Pessoa que receberá').fill('Contato preservado');
 await page.getByRole('button',{name:'Alterar localização',exact:true}).click();
 await page.locator('.sales-customer-mini-map').click({position:{x:100,y:100}});
 await page.getByRole('button',{name:'Salvar localização',exact:true}).click();
 await expect(page.getByRole('button',{name:'Alterar localização',exact:true})).toBeVisible();
 expect(writes).toHaveLength(1);expect(writes[0].action).toBe('location');expect(writes[0].customer_key).toBe('m8:1');
 expect(writes[0].latitude).not.toBe(-27.8);
 await expect(page.getByLabel('Pessoa que receberá')).toHaveValue('Contato preservado');
});

test('new lead searches a city and submits its selected map position',async({page,context})=>{
 await context.addCookies([{name:'m8-refresh',value:'test',domain:'localhost',path:'/'}]);
 const writes:any[]=[];
 await page.route('**/api/activity',r=>r.fulfill({json:{}}));
 await page.route('https://tile.openstreetmap.org/**',r=>r.abort());
 await page.route('**/api/visits',r=>{if(r.request().method()==='POST'){writes.push(r.request().postDataJSON());return r.fulfill({json:{saved:true}})}return r.fulfill({json:{name:'Vendedor',customers:[],visits:[]}})});
 await page.route('**/api/visits/location-search',r=>r.fulfill({json:{results:[{label:'Lages, SC, Brasil',latitude:-27.8,longitude:-50.3}]}}));
 await page.goto('/visitas');await page.getByRole('button',{name:/Visitas Sua carteira/}).click();await expect(page.getByRole('heading',{name:'Saúde da carteira'})).toBeVisible();
 await page.getByRole('button',{name:'Agendar visita',exact:true}).click();
 await page.getByLabel('Novo cliente fora da base (Lead)').check();
 await page.getByLabel('Nome do Lead').fill('Lead mapa');
 await expect(page.locator('.sales-customer-mini-map')).toHaveClass(/leaflet-container/);
 await page.getByLabel('Buscar endereço ou cidade').fill('Lages SC');
 await page.getByRole('button',{name:'Buscar no mapa',exact:true}).click();
 await page.getByRole('button',{name:'Lages, SC, Brasil',exact:true}).click();
 await expect(page.locator('.sales-location-marker')).toBeVisible();
 await page.getByLabel('Cidade',{exact:true}).fill('Lages');
 await page.getByLabel('Data e hora agendada').fill('2026-11-20T10:00');
 await page.getByLabel('Pessoa que receberá').fill('João');
 await page.getByLabel('Telefone de contato').fill('49999999999');
 await page.getByRole('button',{name:'Salvar agendamento',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('Visita agendada');
 expect(writes[0].lead.location).toEqual({latitude:-27.8,longitude:-50.3});
});
