import { test, expect } from "@playwright/test";
import { blankOperation } from "../lib/service-scheduling/model";
test("reviewed OS exposes ERP edits and customer delivery", async ({
  page,
  context,
}) => {
  test.setTimeout(90000);
  await context.addCookies([
    { name: "m8-access", value: "test", domain: "localhost", path: "/" },
  ]);
  await page.route("**/api/activity", (r) =>
    r.fulfill({ json: { admin: true } }),
  );
  const template = {
    id: "check",
    name: "Relatório técnico",
    stages: [
      {
        id: "s",
        name: "01. Verificação",
        groups: [
          {
            id: "g",
            name: "Inspeção",
            fields: [
              { id: "f", label: "Resultado", type: "text", required: true },
              {
                id: "flag",
                label: "Verificação",
                type: "flag",
                options: ["OK", "NOK", "NA"],
                alertOptions: [],
                required: true,
              },
            ],
          },
        ],
      },
    ],
  };
  const operation = {
    id: "op1",
    position: 1,
    version: 1,
    status: "reviewed",
    document: {
      ...blankOperation(),
      responsible: "tech",
      description: "Revisar compressor",
      checklistId: "check",
      checklistRun: {
        template,
        submission: { at: "2026-09-30T12:00:00Z", by: "tech" },
        stages: {
          s: {
            status: "submitted",
            answers: { f: "Tudo conferido", flag: "OK" },
          },
        },
      },
    },
  };
  const data: any = {
    canEditSettings: true,
    email: "planner",
    settings: {
      version: 1,
      document: {
        checklists: [template],
        serviceTypes: [],
        calendars: [],
        vehicles: [],
      },
    },
    users: [{ email: "tech", display_name: "Técnico", enabled: true }],
    schedule: { id: "1", company_id: 1, order_id: "100", planned_date:{date:"2026-11-04",source:"scheduled",reason:"Operação 1 às 08:00 já programada."} },
    detail: {
      order: {
        numero_sequencia: 123,
        cliente_nome: "Cliente",
        equipamento: "Compressor",
      },
      materials: [
        {
          id_m8: "55",
          item_company: 1,
          item_order: "100",
          produto_id: 10,
          produto_nome: "Filtro",
          quantidade: 1,
          unidade_nome: "UN",
        },
      ],
      services: [],
    },
    operations: [operation],
    usage: [
      {
        item_id: "55",
        item_company: 1,
        item_order: "100",
        withdrawn: 1,
        allocations: [{ operationId: "op1", position: 1, quantity: 1 }],
      },
    ],
    costs: [],
    events: [{ id: 1, operation_id: "another", action: "work_log", hours: 99 }],
    fieldSessions: [],
    fieldEvents: [],
    requests: [],
    profit: null,
  };

  data.users.push({
    email: "billing@test.com",
    display_name: "Faturamento",
    enabled: true,
  });
  const calls: any[] = [];let summaryAttempts=0;
  await page.route("**/api/service-scheduling**", (r) => {
    if (r.request().method() === "POST") {
      calls.push(r.request().postDataJSON());
      if(r.request().url().includes('/summary-attachment')){
        if(++summaryAttempts===1)return r.fulfill({status:503,json:{error:'Anexo pendente de envio.'}});
        return r.fulfill({json:{id:'321',filename:'OS 123 - Cliente.pdf'}});
      }
      if(r.request().url().includes('/customer-email'))return r.fulfill({json:{raw:Buffer.from('X-Unsent: 1\r\n').toString('base64url'),filename:'OS 12345.eml',reportFilename:'OS 12345.pdf'}});
      return r.fulfill({ json: { released: true, queued: true } });
    }
    return r.fulfill({ json: data });
  });
  await page.route("**/api/warehouse**", (r) =>
    r.fulfill({
      json: { rows: [{ id: "18", name: "Liberado para faturamento" }] },
    }),
  );
  const draft = {
    company: "1",
    notes: "Observação original",
    internalNotes: "Interna original",
    flowStatus: "18",
    items: [{ code: "123", quantity: "2", price: "10" }],
  };
  await page.route("**/api/service-orders**", (r) => {
    if(r.request().url().includes("/attachments"))return r.fulfill({json:{rows:[]}});
    if (r.request().method() === "POST") {
      calls.push(r.request().postDataJSON());
      return r.fulfill({ json: { state: "complete" } });
    }
    return r.fulfill({
      json: {
        version: "v1",
        draft,
        labels: { flowStatus: "Liberado para faturamento" },
      },
    });
  });
  await page.goto("/programacao?OS=123");
  await expect(page.locator('.schedule-order-fields')).toContainText('Data prevista de programação');
  await page.locator('.schedule-order-fields .schedule-date-explanation').click();
  await expect(page.getByRole('tooltip')).toContainText('Operação 1 às 08:00 já programada.');
  await page.keyboard.press('Escape');
  await page
    .getByRole("button", { name: "Editar observações e Status Fluxo" })
    .click();
  await page
    .getByLabel("Observação", { exact: true })
    .fill("Cliente solicitou retorno");
  await page
    .getByLabel("Observação Interna", { exact: true })
    .fill("Conferir cadastro");
  await expect(page.getByRole('checkbox',{name:'Anexar relatório resumido automaticamente na OS'})).toBeChecked();
  await page.getByRole("button", { name: "Salvar no ERP" }).click();
  await expect(page.locator('.schedule-order-actions').getByRole('alert')).toContainText('A OS foi atualizada no ERP, mas o relatório resumido não foi anexado.');
  const headerWrites=calls.filter(c=>c.action?.startsWith('edit-')).length;
  await page.getByRole('button',{name:'Reenviar anexos pendentes',exact:true}).click();
  expect(calls.filter(c=>c.action?.startsWith('edit-')).length).toBe(headerWrites);
  expect(summaryAttempts).toBe(2);
  await expect(
    page.locator(".schedule-order-actions").getByRole("status"),
  ).toContainText("atualizados no ERP");
  expect(calls.find((c) => c.action === "edit-prepare").draft.items).toEqual(
    draft.items,
  );
  expect(calls.find((c) => c.action === "edit-prepare").draft.notes).toBe(
    "Cliente solicitou retorno",
  );
  await page.getByRole('button',{name:'Editar observações e Status Fluxo'}).click();
  await expect(page.getByRole('checkbox',{name:'Anexar relatório resumido automaticamente na OS'})).toBeChecked();
  await page.getByRole('checkbox',{name:'Anexar relatório resumido automaticamente na OS'}).uncheck();
  await page.getByRole('button',{name:'Salvar no ERP',exact:true}).click();
  await expect(page.locator('.schedule-order-actions').getByRole('status')).toContainText('atualizados no ERP');
  expect(summaryAttempts).toBe(2);
  await page.getByRole('button',{name:'Enviar por e-mail',exact:true}).click();
  await page.getByLabel('Destinatário',{exact:true}).fill('cliente@example.com');
  const download=page.waitForEvent('download');
  await page.getByRole('button',{name:'Baixar e-mail com anexo',exact:true}).click();
  expect((await download).suggestedFilename()).toBe('OS 12345.eml');
  expect(calls.find(c=>c.to==='cliente@example.com').body).toContain('relatório técnico resumido');
  expect(calls.some(c=>c.action==='customer_report')).toBe(false);
  await expect(page.getByRole('button',{name:'Liberar para baixa interna',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Enviar para faturamento',exact:true})).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page
      .locator(".schedule-order-actions")
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  await page.screenshot({
    path: "/tmp/schedule-workflow-mobile.png",
    fullPage: true,
  });
});
