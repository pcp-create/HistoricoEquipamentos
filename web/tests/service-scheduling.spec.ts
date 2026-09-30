import { test, expect } from "@playwright/test";
import {
  blankOperation,
  planningStatus,
} from "../lib/service-scheduling/model";
test("operations save explicitly, keep support distinct, show order-wide items and remain contained on mobile", async ({
  page,
  context,
  request,
}) => {
  expect((await request.get("/api/service-scheduling")).status()).toBe(401);
  expect(
    (await request.post("/api/service-scheduling", { data: {} })).status(),
  ).toBe(403);
  await context.addCookies([
    { name: "m8-access", value: "test", domain: "localhost", path: "/" },
  ]);
  await page.route("**/api/activity", (r) =>
    r.fulfill({ json: { admin: true } }),
  );
  const data: any = {
    canEditSettings: true,
    automaticOptions: {status_lancamento_nome:["EM CRIAÇÃO"],tipo_nome:["A"],situacao_nome:["COBRANÇA CRM/AT"],tipo_atendimento_nome:["Interno"]},
    email: "a@test.com",
    settings: {
      version: 1,
      document: {
        serviceTypes: ["Interno", "Externo", "Terceirizado"],
        vehicles: [{id:"van",name:"Van / ABC1D23"}],
        checklists: [],
        calendars: [
          {
            id: "standard",
            name: "Padrão",
            week: [{ day: 1, start: "07:30", end: "12:00" }],
          },
        ],
      },
    },
    users: [
      {
        email: "a@test.com",
        display_name: "Ana",
        job_title: "Técnico",
        enabled: true,
        hourly_cost: 50,
      },
      {
        email: "b@test.com",
        display_name: "Bruno",
        job_title: "Técnico",
        enabled: true,
        hourly_cost: 30,
      },
    ],
    schedule: { id: "1", company_id: 1, order_id: "100" },
    detail: {
      order: {
        numero_sequencia: 123,
        cliente_nome: "Cliente",
        equipamento: "Compressor",
      },
      detail_at: "2026-09-28",
      materials: [
        {
          id_m8: 55,
          produto_id: 10,
          produto_nome: "Filtro",
          quantidade: 2,
          unidade_nome: "UN",
          valor_total: 100,
          current_average_cost: 20,
          current: { unit: "UN" },
        },
      ],
      services: [
        {
          id_m8: 60,
          servico_id: 20,
          servico_nome: "Revisão",
          quantidade: 1,
          valor_unitario: 200,
          valor_total: 200,
          service_unit: "UN",
        },
      ],
    },
    usage: [],
    costs: [],
    events: [],
    profit: null,
    operations: Array.from({ length: 1 }, (_, i) => ({
      id: String(i + 1),
      position: i + 1,
      status: "pending",
      version: 1,
      document: blankOperation(),
      sent_at: null,
    })),
  };
  await page.route("**/api/service-scheduling**", (r) => {
    if (r.request().method() === "GET") return r.fulfill({ json: data });
    const b = r.request().postDataJSON();
    if (b.action === "automatic_preview") return r.fulfill({json:{preview:{matching:3,new_orders:2,removed:0}}});
    if (b.action === "settings") {
      data.settings = {document:b.document,version:data.settings.version+1};
      return r.fulfill({json:{settings:data.settings}});
    }
    if (b.action === "operation") {
      const o = data.operations.find((o: any) => o.id === b.operationId);
      o.document = b.document;
      o.status = planningStatus(b.document);
      o.version++;
      return r.fulfill({ json: { operation: o } });
    }
    if (b.action === "usage") {
      const item = {
        item_id: 55,
        version: 1,
        withdrawn: b.withdrawn,
        used: b.used,
      };
      data.usage = [item];
      return r.fulfill({ json: { item } });
    }
    return r.fulfill({ json: {} });
  });
  await page.goto("/programacao?id=1");
  await expect(
    page.getByRole("heading", { name: "Programação de OSs", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".operations-table tbody>tr")).toHaveCount(1);
  await page
    .getByLabel("Tipo Serviço 01", { exact: true })
    .selectOption("Interno");
  await page
    .getByLabel("Responsável 01", { exact: true })
    .selectOption("a@test.com");
  const support = page.getByLabel("Equipe de Apoio 01", { exact: true });
  const row = page.locator(".operations-table tbody>tr").first();
  const rowHeight = await row.evaluate(
    (el) => el.getBoundingClientRect().height,
  );
  await support.click();
  await expect(page.getByLabel("Filtrar equipe de apoio 1")).toBeVisible();
  expect(await row.evaluate((el) => el.getBoundingClientRect().height)).toBe(
    rowHeight,
  );
  const options = page.getByRole("group", { name: "Usuários de apoio" });
  await expect(
    options.getByRole("button", { name: "Ana", exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Filtrar equipe de apoio 1").fill("bru");
  await options.getByRole("button", { name: "Bruno", exact: true }).click();
  await expect(options).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Remover apoio Bruno" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Remover apoio Bruno" }).click();
  await expect(
    page.getByRole("button", { name: "Remover apoio Bruno" }),
  ).toHaveCount(0);
  await support.click();
  await options.getByRole("button", { name: "Bruno", exact: true }).click();
  await page.getByLabel("Duração 01", { exact: true }).fill("2");
  await page.getByLabel("Duração 01", { exact: true }).press("Tab");
  await expect(
    page.locator(".operations-table tbody>tr").first().locator("td").nth(9),
  ).toHaveText("4,00");
  await page
    .getByLabel("Data de Programação 01", { exact: true })
    .fill("2026-10-02");
  await page.getByLabel("Data de Programação 01", { exact: true }).blur();
  await expect(
    page.getByText("Alterações não salvas", { exact: true }),
  ).toBeVisible();
  expect(data.operations[0].version).toBe(1);
  await page
    .getByRole("button", { name: "Salvar operação 01", exact: true })
    .click();
  await expect(
    page.getByText("Alterações não salvas", { exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".operation-status").first()).toHaveText(
    "Em planejamento",
  );
  await page.getByLabel("Hora início 01", { exact: true }).fill("11:00");
  await page.getByLabel("Hora início 01", { exact: true }).press("Enter");
  await expect(page.locator(".operation-status").first()).toHaveText(
    "Programado",
  );
  const heightBeforeNote = await row.evaluate(el => el.getBoundingClientRect().height);
  await page.getByLabel("Observação interna 01", {exact:true}).click();
  const note = "Texto completo da observação interna.\n".repeat(50);
  await page.getByLabel("Texto da observação interna").fill(note);
  await page.getByRole("dialog").getByRole("button", {name:"Salvar",exact:true}).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(data.operations[0].document.internalNote).toBe(note);
  await page.getByLabel("Veículo 01", {exact:true}).selectOption("van");
  await page.getByRole("button", {name:"Salvar operação 01",exact:true}).click();
  await expect(page.getByRole("button", {name:"Salvar operação 01",exact:true})).toBeDisabled();
  expect(data.operations[0].document.internalNote).toBe(note);
  expect(data.operations[0].document.vehicleId).toBe("van");
  expect(await row.evaluate(el => el.getBoundingClientRect().height)).toBe(heightBeforeNote);
  await page.getByRole("button", { name: "Produtos", exact: true }).click();
  await expect(page.getByLabel("Quantidade Retirada Filtro")).toHaveValue("");
  await expect(page.getByLabel("Quantidade Utilizada Filtro")).toHaveValue("");
  await page.getByLabel("Quantidade Retirada Filtro").fill("1");
  await page.getByLabel("Quantidade Retirada Filtro").press("Tab");
  await expect(page.getByLabel("Quantidade Utilizada Filtro")).toHaveValue("");
  await page.getByRole("button", { name: "Custos", exact: true }).click();
  await expect(page.locator(".schedule-costs")).toContainText("160,00");
  await expect(page.locator(".schedule-costs")).toContainText("60%");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page
      .locator(".scheduling-page")
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  await page.getByRole("button", {name:"Configurações",exact:true}).click();
  await page.getByRole("button", {name:"Adicionar tipo de serviço",exact:true}).click();
  await page.getByLabel("Novo tipo de serviço",{exact:true}).fill("Inspeção");
  await page.getByLabel("Novo tipo de serviço",{exact:true}).press("Enter");
  await expect(page.getByLabel("Tipo de serviço Inspeção",{exact:true})).toHaveValue("Inspeção");
  await page.getByRole("button", {name:"Veículos",exact:true}).click();
  await page.getByRole("button", {name:"Adicionar veículo",exact:true}).click();
  await page.getByLabel("Novo veículo",{exact:true}).fill("Caminhonete / XYZ1A23");
  await page.getByLabel("Novo veículo",{exact:true}).press("Enter");
  await expect(page.getByLabel("Veículo Caminhonete / XYZ1A23",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Checklists",exact:true}).click();
  await page.getByRole("button",{name:"Usar modelo CCP",exact:true}).click();
  await expect(page.getByLabel("Prefixo",{exact:true})).toHaveValue("CCP");
  await page.getByLabel("Identificador M8",{exact:true}).selectOption("Interno");
  await expect(page.locator(".checklist-stage-editor")).toHaveCount(6);
  await expect(page.getByLabel("Tipo do campo 1 da etapa 1",{exact:true})).toHaveValue("meter");
  const group=page.locator(".checklist-group-editor").first();
  await group.locator(":scope > summary").click();
  await expect(group).not.toHaveAttribute("open", "");
  await page.getByRole("button",{name:"Editar nome: grupo 1 da etapa 1",exact:true}).click();
  await page.getByLabel("Nome: grupo 1 da etapa 1",{exact:true}).fill("Informações do ativo");
  await page.getByLabel("Nome: grupo 1 da etapa 1",{exact:true}).press("Enter");
  await expect(group).not.toHaveAttribute("open", "");
  await group.locator(":scope > summary").click();
  await page.getByRole("button",{name:"Editar nome: etapa 1",exact:true}).click();
  await page.getByLabel("Nome: etapa 1",{exact:true}).fill("Medições do equipamento");
  await page.getByLabel("Nome: etapa 1",{exact:true}).press("Enter");
  await page.getByLabel("Fotos: Horímetro total",{exact:true}).check();
  await page.getByLabel("Máximo de fotos: Horímetro total",{exact:true}).fill("3");
  await page.getByLabel("Comentário: Horímetro total",{exact:true}).check();
  await page.getByLabel("Relatório: Horímetro total",{exact:true}).uncheck();
  await page.getByLabel("Observação interna: Horímetro total",{exact:true}).check();
  await expect(page.locator(".checklist-field-menu:popover-open")).toHaveCount(0);
  await page.getByRole("button",{name:"Opções do campo 2 da etapa 1",exact:true}).click();
  await expect(page.locator(".checklist-field-menu:popover-open")).toBeVisible();
  await page.locator(".checklist-field-menu:popover-open select").selectOption({label:"Operação"});
  await expect(page.locator(".checklist-field-menu:popover-open")).toHaveCount(0);
  await page.getByLabel("Tipo do campo 2 da etapa 1",{exact:true}).selectOption({label:"Indicador de Status"});
  await page.locator('textarea[aria-label="Opções do campo 2 da etapa 1"]').fill("Ligado\nDesligado");
  await page.getByRole("button",{name:"Salvar checklists",exact:true}).click();
  await expect(page.getByText("Modelos salvos",{exact:true})).toBeVisible();
  expect(data.settings.document.checklists[0].stages[4].fields[0].type).toBe("photo");
  expect(data.settings.document.checklists[0].stages[0].groups[0].name).toBe("Informações do ativo");
  expect(data.settings.document.checklists[0].stages[0].groups[0].fields[0].maxPhotos).toBe(3);
  expect(data.settings.document.checklists[0].stages[0].groups[0].fields[0].report).toBe(false);
  expect(data.settings.document.checklists[0].stages[0].groups.find((g:any)=>g.name==="Operação").fields.some((f:any)=>f.label==="Horas em carga")).toBe(true);
  expect(data.settings.document.checklists[0].stages[0].fields[1].options).toEqual(["Ligado","Desligado"]);
  expect(data.settings.document.checklists[0].m8Identifier).toBe("Interno");
  await page.getByRole("button",{name:"← Voltar à lista",exact:true}).click();
  await expect(page.locator(".checklist-stage-editor")).toHaveCount(0);
  await expect(page.getByRole("button",{name:/Editar checklist/})).toHaveCount(1);
  await page.getByRole("button",{name:"+ Configurar intervalo",exact:true}).click();
  await page.getByLabel("Tipo de atendimento da preventiva 1",{exact:true}).selectOption("Interno");
  await page.getByLabel("Intervalo em horas da preventiva 1",{exact:true}).fill("2000");
  await page.getByLabel("Intervalo em meses da preventiva 1",{exact:true}).fill("6");
  await page.getByRole("button",{name:"Salvar checklists",exact:true}).click();
  await expect(page.getByText("Modelos salvos",{exact:true})).toBeVisible();
  expect(data.settings.document.preventiveTypes).toEqual([{m8Identifier:"Interno",hours:2000,months:6}]);

  await page.getByRole("button",{name:/Editar checklist/}).click();
  await expect(page.getByLabel("Identificador M8",{exact:true})).toHaveValue("Interno");
  await page.getByRole("button",{name:"Entrada automática",exact:true}).click();
  await page.getByRole("button",{name:"Adicionar regra",exact:true}).click();
  await page.getByLabel("Valor 1.1",{exact:true}).selectOption("COBRANÇA CRM/AT");
  await page.getByRole("button",{name:"Adicionar condição E/OU",exact:true}).click();
  await page.getByLabel("Campo 1.2",{exact:true}).selectOption("tipo_atendimento_nome");
  await page.getByLabel("Valor 1.2",{exact:true}).selectOption("Interno");
  await page.getByLabel("Ligação 1.2",{exact:true}).selectOption("and");
  await page.getByRole("button",{name:"Adicionar regra",exact:true}).click();
  await page.getByLabel("Campo 2.1",{exact:true}).selectOption("status_lancamento_nome");
  await page.getByLabel("Valor 2.1",{exact:true}).selectOption("EM CRIAÇÃO");
  await page.getByLabel("Ativar entrada automática",{exact:true}).check();
  await page.getByRole("button",{name:"Pré-visualizar resultado",exact:true}).click();
  await expect(page.getByText(/3 OSs correspondentes/)).toBeVisible();
  await page.getByRole("button",{name:"Salvar regras",exact:true}).click();
  await expect(page.getByText("Automação ativa",{exact:true})).toBeVisible();
  expect(data.settings.document.automaticEntry.rules.length).toBe(2);
  await page.getByRole("button", {name:"Calendários",exact:true}).click();
  await expect(page.getByLabel("Calendário em edição")).toBeVisible();
  await page.getByLabel("24 horas por dia", {exact:true}).check();
  await expect(page.getByText("Jornada contínua, de 00:00 até 00:00 do dia seguinte.")).toBeVisible();
  await page.getByRole("button", {name:"Aplicar aos dias selecionados"}).click();

  await page.getByRole("button", {name:"Criar exceção nesta data"}).click();
  await page.getByLabel("Nome da exceção").fill("Feriado de teste");
  await page.getByRole("button", {name:"Aplicar exceção"}).click();
  await expect(page.getByText("Alterações pendentes de gravação")).toBeVisible();
  await page.getByRole("button", {name:"Salvar calendários"}).click();
  await expect(page.getByText("Alterações pendentes de gravação")).toHaveCount(0);
  expect(data.settings.document.calendars[0].exceptions[0].name).toBe("Feriado de teste");
  expect(data.settings.document.calendars[0].week.find((w:any)=>w.day===1).end).toBe("24:00");
  const initialCount=data.settings.document.calendars.length;
  const original=JSON.stringify(data.settings.document.calendars[0]);
  for(let i=0;i<2;i++) {
    await page.getByRole("button",{name:"Novo calendário",exact:true}).click();
    await page.getByRole("button",{name:"Salvar calendários",exact:true}).click();
    await expect(page.getByText("Alterações pendentes de gravação")).toHaveCount(0);
    await expect(page.getByRole("button",{name:"Novo calendário",exact:true})).toBeEnabled();
  }
  expect(data.settings.document.calendars.length).toBe(initialCount+2);
  expect(new Set(data.settings.document.calendars.map((c:any)=>c.id)).size).toBe(initialCount+2);
  expect(JSON.stringify(data.settings.document.calendars[0])).toBe(original);
  const selectorHeight=await page.getByLabel("Calendário em edição").evaluate(el=>el.getBoundingClientRect().height);
  const buttonHeight=await page.getByRole("button",{name:"Criar cópia",exact:true}).evaluate(el=>el.getBoundingClientRect().height);
  expect(selectorHeight).toBe(buttonHeight);

  expect(await page.locator(".calendar-editor").evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);

});
