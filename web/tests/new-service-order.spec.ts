import { test, expect } from "@playwright/test";
test.setTimeout(90000);
test("new OS selects company, filters equipment, fills seller and submits header/products/services", async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: "m8-access", value: "test", domain: "localhost", path: "/" },
  ]);
  await page.route("**/api/tasks*", r => r.fulfill({json:{tasks:[],users:[],settings:{},canManage:false}}));
  await page.route("**/api/activity", (r) =>
    r.fulfill({ json: { admin: false } }),
  );
  await page.route("**/api/history?*", (r) =>
    r.fulfill({
      json: new URL(r.request().url()).searchParams.has("overview")
        ? { orders: 0, materials: 0, clients: 0, imported: 0, statuses: [] }
        : { rows: [], total: 0, page: 1, size: 50 },
    }),
  );
  await page.route("**/api/orders/2/800", (r) =>
    r.fulfill({
      json: {
        order: {
          company_id: 2,
          id_m8: "800",
          numero_sequencia: "15099",
          cliente_nome: "Cliente recém criado",
        },
        materials: [],
        services: [],
        equipment: [],
        detail_at: "2026-10-22T12:00:00Z",
      },
    }),
  );
  let saved: any,
    step = 0,
    equipmentQueries: string[] = [];
  const metadata = {
    types: [{ id: "1", name: "Corretiva", customer_equipment_only: true }],
    registries: [
      {
        kind: "service-types",
        id: "1",
        name: "Manutenção",
        warranty_id: 3,
        warranty_description: "90 dias",
      },
      ...[
        "service-origins",
        "payment-terms",
        "order-statuses",
        "flow-statuses",
        "freight",
      ].map((kind) => ({
        kind,
        id: kind === "freight" ? "0" : "1",
        name: kind === "freight" ? "CIF" : "Opção",
      })),
    ],
    users: [
      { email: "tech@example.com", name: "Técnico", m8_employee_id: 99 },
      {
        email: "missing@example.com",
        name: "Sem vínculo",
        m8_employee_id: null,
      },
    ],
  };
  await page.route("**/api/service-orders**", async (r) => {
    const p = new URL(r.request().url()).searchParams;
    if (r.request().method() === "POST") {
      const b = r.request().postDataJSON();
      if (b.action === "prepare") {
        saved = b.draft;
        return r.fulfill({
          json: {
            id: b.id,
            state: "ready",
            company: 2,
            nextItem: 0,
            itemCount: 4,
          },
        });
      }
      step++;
      return r.fulfill({
        json: {
          id: b.id,
          state: step === 5 ? "complete" : "ready",
          company: 2,
          m8Id: 800,
          nextItem: Math.max(0, step - 1),
          itemCount: 4,
        },
      });
    }
    switch (p.get("lookup")) {
      case "metadata":
        return r.fulfill({ json: metadata });
      case "customers":
        return r.fulfill({
          json: { rows: [{ id: "10", name: "Cliente Teste" }] },
        });
      case "equipment":
        equipmentQueries.push(p.toString());
        return r.fulfill({
          json: { rows: [{ id: "100", name: "Compressor do cliente" }] },
        });
      case "sellers":
        return r.fulfill({
          json: {
            rows: [{ id: "20", name: "Vendedor padrão", default: true }],
          },
        });
      default:
        return r.fulfill({ json: { rows: [] } });
    }
  });
  await page.route("**/api/quotes?**", (r) => {
    const kind =
      new URL(r.request().url()).searchParams.get("lookup") === "materials"
        ? "material"
        : "service";
    return r.fulfill({
      json: {
        items: [
          {
            key: kind + ":1",
            kind,
            code: kind === "material" ? "50" : "60",
            name: kind === "material" ? "Filtro novo" : "Revisão geral",
            unit: "UN",
            quantity: "1",
            price: "10",
            referencePrice: "10",
          },
        ],
        truncated: false,
      },
    });
  });
  await page.setViewportSize({width:390,height:844});
  await page.goto("/OrdemServico/nova");
  const choose = async (label: string, id: string) => {
    await page.getByRole("combobox", { name: label, exact: true }).click();
    await page
      .getByRole("option")
      .filter({
        has: page.locator(".order-choice-id").filter({
          hasText: new RegExp("^(ID )?" + id.replaceAll(".", "\\.") + "$"),
        }),
      })
      .click();
  };
  await expect(
    page.getByRole("heading", { name: "Nova Ordem de Serviço" }),
  ).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Cliente", exact: true }),
  ).toBeDisabled();
  await choose("Empresa", "2");
  await page.getByRole("button", { name: "Criar OS no M8" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "tipo de OS" }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Tipo Ordem de Serviço", exact: true })
    .click();
  const typeSearch = page.getByRole("combobox", {
    name: "Tipo Ordem de Serviço",
    exact: true,
  });
  await typeSearch.fill("corretiva");
  await typeSearch.press("ArrowDown");
  await expect(typeSearch).toBeFocused();
  await expect(typeSearch).toHaveAttribute("aria-activedescendant", /.+-0$/);
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("combobox", { name: "Tipo Ordem de Serviço", exact: true }),
  ).toHaveAttribute("aria-expanded", "false");

  await page.getByRole("combobox", { name: "Cliente", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Cliente", exact: true })
    .fill("Cliente");
  await page.getByRole("option", { name: /Cliente Teste/ }).click();
  await expect(
    page.getByRole("combobox", { name: "Vendedor", exact: true }),
  ).toHaveValue(/Vendedor padrão/);
  await choose("Equipamento", "100");
  expect(equipmentQueries[0]).toContain("customer=10");
  expect(equipmentQueries[0]).toContain("type=1");
  await choose("Tipo Atendimento", "1");
  await expect(page.getByLabel("Prazo Garantia")).toHaveValue("90 dias");
  for (const label of [
    "Origem Atendimento",
    "Condição de Pagamento",
    "Situação Ordem Serviço",
  ])
    await choose(label, "1");
  await choose("Status Fluxo", "1");
  await choose("Frete", "0");
  await page
    .getByText("Outras informações (opcionais)", { exact: true })
    .click();
  await choose("Técnico", "99");
  await expect(
    page.getByRole("combobox", { name: "Técnico", exact: true }),
  ).toHaveValue("99 - Técnico");
  await page.getByLabel("Data Entrega Prevista").fill("2026-10-23");
  await page.getByLabel("Data Entrega *", { exact: true }).fill("2026-10-24");
  await page
    .getByLabel("Observações *", { exact: true })
    .fill("Teste de observação");
  await page.getByLabel("Observações Internas").fill("Teste interno");
  await page.getByLabel("Contato", { exact: true }).fill("Contato técnico");
  await page
    .getByText("Outras informações (opcionais)", { exact: true })
    .click();
  await page.screenshot({
    path: "/tmp/new-service-order-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Produtos (0)", exact: true }).click();
  await page.getByRole("button", { name: "Adicionar Produto", exact:true }).click();
  await page.getByRole("dialog").getByLabel("Pesquisar no cadastro").fill("Filtro");
  await page.getByRole("dialog").getByRole("button",{name:"Adicionar",exact:true}).click();
  await expect(page.getByRole("dialog").getByRole("button",{name:"Já incluído"})).toBeDisabled();
  await page.getByRole("dialog").getByRole("button",{name:"Fechar",exact:true}).click();
  await expect(page.getByRole("textbox",{name:"Valor unitário",exact:true})).toHaveValue("10,00");
  await page.getByRole("textbox",{name:"Valor unitário",exact:true}).fill("181,69");
  await page.getByRole("heading",{name:"Produtos da OS"}).click();
  await expect(page.getByRole("textbox",{name:"Valor unitário",exact:true})).toHaveValue("181,69");
  await page.getByRole("button", { name: "Serviços (0)", exact: true }).click();
  await page.getByRole("button", { name: "Adicionar Serviço", exact:true }).click();
  await page.getByRole("dialog").getByLabel("Pesquisar no cadastro").fill("Revisão");
  await page.getByRole("dialog").getByRole("button",{name:"Adicionar",exact:true}).click();
  await expect(page.getByRole("dialog").getByRole("button",{name:"Já incluído"})).toBeDisabled();
  await page.getByRole("dialog").getByRole("button",{name:"Fechar",exact:true}).click();
  await page.getByRole("button", {name:/^Observação:/}).click();
  await page.getByRole("dialog").getByLabel("Observação", {exact:true}).fill("Detalhe do serviço");
  await page.getByRole("button", {name:"Salvar observação",exact:true}).click();
  await page.getByRole("button", {name:/^Observação interna:/}).click();
  await page.getByRole("dialog").getByLabel("Observação interna", {exact:true}).fill("Orientação interna");
  await page.getByRole("button", {name:"Salvar observação",exact:true}).click();
  await page.getByRole("button", { name: "Criar OS no M8" }).click();
  await expect(page).toHaveURL(/\/historico\?/, {timeout:30000});
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("heading", { name: /OS-15099/ })).toBeVisible();
  await expect(
    page.getByRole("heading", {name:"Cliente recém criado", exact:true}),
  ).toBeVisible();
  expect(saved.company).toBe("2");
  expect(saved.extra.contato).toBe("Contato técnico");
  expect(saved.freight).toBe("0");
  expect(saved.items).toHaveLength(2);
  expect(saved.items[0].price).toBe("181.69");
  expect(saved.items[1].notes).toBe("Detalhe do serviço");
  expect(saved.items[1].internalNotes).toBe("Orientação interna");
  expect(step).toBe(5);
});
