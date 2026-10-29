import { test, expect } from "@playwright/test";
import { build } from "esbuild";
import { readFileSync } from "node:fs";
test("combined sales filters, pending edit link and PBIX contract columns", async ({
  page,
}) => {
  const bundle = await build({
    stdin: {
      contents: `import React from 'react';import {createRoot} from 'react-dom/client';import Screen from './components/commercial-report';createRoot(document.getElementById('root')).render(<Screen kind={window.reportKind||"sales"}/>);`,
      resolveDir: process.cwd(),
      loader: "tsx",
    },
    define: { "process.env.NODE_ENV": '"development"' },
    bundle: true,
    write: false,
    outdir: "out",
    jsx: "automatic",
    plugins: [
      {
        name: "header",
        setup(b) {
          b.onResolve({ filter: /^next\/navigation$/ }, () => ({
            path: "navigation",
            namespace: "navigation",
          }));
          b.onLoad({ filter: /.*/, namespace: "navigation" }, () => ({
            contents:
              "export function useSearchParams(){return new URLSearchParams(window.location.search)}",
            loader: "js",
          }));
          b.onResolve({ filter: /^next\/link$/ }, () => ({
            path: "link",
            namespace: "link",
          }));
          b.onLoad({ filter: /.*/, namespace: "link" }, () => ({
            contents:
              'import React from "react";export default function Link(p){return React.createElement("a",p,p.children)}',
            loader: "js",
            resolveDir: process.cwd(),
          }));
          b.onResolve({ filter: /^\.\/site-header$/ }, () => ({
            path: "header",
            namespace: "mock",
          }));
          b.onLoad({ filter: /.*/, namespace: "mock" }, () => ({
            contents: "export default function Header(){return null}",
            loader: "js",
            resolveDir: process.cwd(),
          }));
        },
      },
    ],
  });
  await page.route("**/report-test?*", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: `<meta name="viewport" content="width=device-width,initial-scale=1"><style>${readFileSync("app/globals.css", "utf8")}\n${bundle.outputFiles.find((f) => f.path.endsWith(".css"))!.text}</style><div id="root"></div><script>${bundle.outputFiles.find((f) => f.path.endsWith(".js"))!.text}</script>`,
    }),
  );

  const details = [
    {
      company: 1,
      id: "101",
      kind: "salesPending",
      name: "Cliente pendente",
      workshop: {visit:"visit-1",name:"RJ Compressores",stage:"repair",label:"Em execução",color:"#237ca3"},
      linkedOrder: { company: 2, id: "901", number: "15901", orderType: "Revisão vinculada", flowStatus: "Aguardando aprovação vinculada" },
      date: "2026-10-30",
      amount: 100,
      fields: {
        sourceCompany: 1,
        flowStatus: "Revisada",
        expected: "2026-10-30",
        equipment: "Compressor",
        notes: "Observação longa",
        seller: "Ana",
        flowOwner: "Comercial",
      },
    },
    {
      company: 1,
      id: "102",
      kind: "salesBilled",
      name: "Cliente faturado",
      date: "2026-10-20",
      amount: 200,
      billing: {
        state: "partial",
        billed: 80,
        balance: 120,
        reason: "Complemento cancelado; confira o saldo.",
        documents: [
          {
            id: "901",
            number: "501",
            date: "2026-10-20",
            amount: 80,
            status: "Processado",
            link: "M8",
          },
          {
            id: "902",
            number: "502",
            date: "2026-10-20",
            amount: 120,
            status: "Cancelado",
            link: "Referência à OS",
          },
        ],
      },
      fields: {
        flowStatus: "Faturada",
        billedDate: "2026-10-20",
        seller: "Bruno",
        flowOwner: "Planejamento",
      },
    },
  ];
  await page.route("**/api/sales-projection?*", (r) =>
    r.fulfill({ json: { details, rows: [], complete: true } }),
  );
  await page.route("**/api/sales-projection/invoice-kind?*", (r) =>
    r.fulfill({
      json: {
        kind:
          new URL(r.request().url()).searchParams.get("id") === "902"
            ? "Serviços"
            : "Peças",
      },
    }),
  );
  await page.goto("/report-test?period=2026-10");
  await page.locator(".cr-filter-panel > summary").click();
  await expect(page.locator(".cr-table tbody tr")).toHaveCount(2);
  await expect(page.locator(".cr-workshop-stage")).toContainText("Em execução");
  await expect(page.locator(".cr-workshop-stage")).toHaveAttribute("href","/oficina");
  const linkedComments = page.locator(".cr-table tbody tr").filter({has: page.getByRole("link",{name:"Editar OS 101",exact:true})}).locator(".cr-linked-order-comment");
  await expect(linkedComments).toHaveCount(3);
  await expect(linkedComments.nth(0)).toContainText("OS-15901");
  await expect(linkedComments.nth(1)).toContainText("Revisão vinculada");
  await expect(linkedComments.nth(2)).toContainText("Aguardando aprovação vinculada");
  await expect(page.locator(".cr-table tbody tr").filter({hasText:"Cliente faturado"}).locator(".cr-linked-order-comment")).toHaveCount(0);
  const originalDraft = { expected: "2026-10-20", flowStatus: "18", notes: "Preservar", items: [] };
  const submittedDrafts: any[] = [];
  await page.route("**/api/service-orders**", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({ json: route.request().url().includes("lookup")
        ? { registries: [{ kind: "flow-statuses", id: "18", name: "Liberado" }, { kind: "flow-statuses", id: "22", name: "Faltando peças" }] }
        : { version: "current-version", draft: originalDraft, labels: { flowStatus: "Liberado" } } });
    }
    const body = route.request().postDataJSON();
    if (body.action === "edit-prepare") {
      submittedDrafts.push(body);
      return route.fulfill({ json: { state: "ready" } });
    }
    return route.fulfill({ json: { state: "complete", localSynced: true } });
  });
  for (const [field, label, value] of [
    ["expected", "Entrega prevista", "2026-11-05"],
    ["flowStatus", "Status do fluxo", "22"],
  ]) {
    await page.getByRole("button", { name: `Editar ${label} da OS 101`, exact: true }).click();
    const editor = page.locator(".cr-quick-dialog");
    await expect(editor).toBeVisible();
    if (field === "expected") {
      await editor.getByLabel(label, { exact: true }).fill(value);
      await editor.getByLabel("Justificativa da alteração", { exact: true }).fill("Aguardando peça");
    }
    else await editor.getByLabel(label, { exact: true }).selectOption(value);
    await editor.getByRole("button", { name: "Salvar no ERP" }).click();
    await expect(editor).toHaveCount(0);
    expect(submittedDrafts.at(-1).draft).toEqual({ ...originalDraft, [field]: value, ...(field === "expected" ? { deliveryChangeReason: "Aguardando peça" } : {}) });
    expect(submittedDrafts.at(-1).version).toBe("current-version");
  }
  await expect(page.locator(".cr-table tbody tr").filter({ has: page.getByRole("link", { name: "Editar OS 101", exact: true }) }).locator('[data-column="expected"]')).toContainText("05/11/2026");
  let releaseFailure!: () => void;
  const pendingFailure = new Promise<void>((resolve) => { releaseFailure = resolve; });
  await page.route("**/api/service-orders", async (route) => {
    await pendingFailure;
    await route.fulfill({ status: 503, json: { error: "ERP indisponível" } });
  });
  await page.getByRole("button", { name: "Editar Entrega prevista da OS 101", exact: true }).click();
  await page.locator(".cr-quick-dialog").getByLabel("Entrega prevista", { exact: true }).fill("2026-12-01");
  await page.locator(".cr-quick-dialog").getByLabel("Justificativa da alteração", { exact: true }).fill("Nova previsão do fornecedor");
  await page.locator(".cr-quick-dialog").getByRole("button", { name: "Salvar no ERP" }).click();
  await expect(page.locator(".cr-quick-dialog")).toHaveCount(0);
  await expect(page.getByText("Salvando no ERP…", { exact: true })).toBeVisible();
  await expect(page.locator(".cr-table tbody tr")).toHaveCount(2);
  releaseFailure();
  await expect(page.locator(".cr-quick-error")).toContainText("ERP indisponível");
  await expect(page.locator(".cr-table tbody tr").filter({ has: page.getByRole("link", { name: "Editar OS 101", exact: true }) }).locator('[data-column="expected"]')).toContainText("05/11/2026");
  const ownerCards = page.getByRole("region", {
    name: "Valores por responsável do fluxo",
  });
  for (const [index, name] of [
    "Almoxarifado",
    "Compras",
    "Planejamento",
    "Comercial",
    "Faturamento",
  ].entries()) {
    await expect(ownerCards.getByRole("button").nth(index + 1)).toContainText(
      name,
    );
  }
  await expect(
    ownerCards.getByRole("button", { name: /Comercial/ }),
  ).toContainText("100,00");
  await ownerCards.getByRole("button", { name: /Comercial/ }).click();
  await expect(page.locator(".cr-table tbody tr")).toHaveCount(1);
  await expect(page.locator(".cr-table tbody")).toContainText(
    "Cliente pendente",
  );
  await expect(
    ownerCards.getByRole("button", { name: /Planejamento/ }),
  ).toBeVisible();
  await ownerCards
    .getByRole("button", { name: /Todos os responsáveis/ })
    .click();
  await expect(page.locator(".cr-table tbody tr")).toHaveCount(2);

  await expect(
    page.getByRole("link", { name: "Editar OS 101" }),
  ).toHaveAttribute("href", /returnTo=.*comercial/);
  await expect(page.getByRole("link", { name: "Editar OS 102" })).toHaveCount(
    0,
  );
  await page.getByRole("combobox", { name: "Situação", exact: true }).selectOption("Processado");
  const billingCards = page.getByRole("region", { name: "Valores por conferência do faturamento" });
  await expect(billingCards).toBeVisible();
  await expect(billingCards.getByRole("button", { name: /Possível parcial/ })).toContainText("1 OS");
  await billingCards.getByRole("button", { name: /Valor conciliado/ }).click();
  await expect(page.locator(".cr-table tbody tr")).toHaveCount(0);
  await billingCards.getByRole("button", { name: /Possível parcial/ }).click();
  await expect(page.locator(".cr-table tbody tr")).toHaveCount(1);
  await expect(page.getByRole("combobox", { name: "Conferência do faturamento", exact: true })).toHaveValue("partial");
  await billingCards.getByRole("button", { name: /Todas as conferências/ }).click();
  await page
    .getByRole("combobox", { name: "Situação", exact: true })
    .selectOption("Pendente");
  await expect(page.locator(".cr-table tbody tr")).toHaveCount(1);
  await page
    .getByRole("combobox", { name: "Situação", exact: true })
    .selectOption("all");
  await page
    .getByRole("button", { name: "Filtrar Vendedor", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Filtro de Vendedor",
    exact: true,
  });
  const checkbox = dialog.getByRole("checkbox", {
    name: "Selecionar tudo",
    exact: true,
  });
  expect(await checkbox.evaluate((el) => getComputedStyle(el).height)).toBe(
    "16px",
  );
  expect(
    await checkbox.evaluate(
      (el) => getComputedStyle(el.parentElement!).flexDirection,
    ),
  ).toBe("row");
  expect(
    await page
      .getByRole("button", { name: "Filtrar Vendedor", exact: true })
      .evaluate((el) => getComputedStyle(el).borderTopWidth),
  ).toBe("0px");
  await expect(
    dialog.getByRole("button", { name: "Aplicar", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/commercial-column-filter.png",
    fullPage: true,
  });
  await dialog
    .getByRole("checkbox", { name: "Selecionar tudo", exact: true })
    .uncheck();
  await dialog.getByLabel("Ana", { exact: true }).check();
  await dialog.getByRole("button", { name: "Aplicar", exact: true }).click();
  await expect(page.locator(".cr-table tbody tr")).toHaveCount(1);
  await expect(page.locator(".cr-table tbody")).toContainText(
    "Cliente pendente",
  );
  await page
    .getByRole("button", { name: "Limpar filtros", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Conferência do faturamento", exact: true })
    .selectOption("partial");
  await expect(page.locator(".cr-table tbody tr")).toHaveCount(1);
  await expect(page.locator(".cr-table tbody")).toContainText(
    "Cliente faturado",
  );
  await page
    .getByRole("button", {
      name: "Conferir faturamento da OS 102",
      exact: true,
    })
    .click();
  const billing = page.getByRole("dialog", {
    name: "OS 102 · Possível parcial",
    exact: true,
  });
  await expect(billing).toBeVisible();
  await expect(billing).toContainText("Cancelado");
  await expect(
    billing.getByRole("columnheader", { name: "Tipo", exact: true }),
  ).toBeVisible();
  await expect(
    billing.getByRole("cell", { name: "Serviços", exact: true }),
  ).toBeVisible();
  await expect(
    billing.getByRole("cell", { name: "Peças", exact: true }),
  ).toBeVisible();
  await expect(billing).toContainText("120,00");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/billing-mobile.png",
    fullPage: true,
  });
  expect(
    await billing.evaluate(
      (el) => el.getBoundingClientRect().width <= innerWidth,
    ),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(billing).not.toBeVisible();
  await page
    .getByRole("button", { name: "Limpar filtros", exact: true })
    .click();
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.screenshot({
    path: "test-results/commercial-sales.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/commercial-sales-mobile.png",
    fullPage: true,
  });
  await page.addInitScript(() => {
    (window as any).reportKind = "contracts";
  });
  details.splice(
    0,
    details.length,
    ...([
      {
        company: 1,
        id: "201",
        kind: "contracts",
        name: "Cliente contrato",
        date: "2026-10-01",
        amount: 100,
        fields: {
          contractType: "Locação",
          installment: "10/12",
          start: "2026-01-01",
          end: "2026-12-31",
          billed: 100,
          pending: 0,
        },
      },
    ] as any),
  );
  for (let i = 0; i < 60; i++)
    details.push({ ...details[0], id: String(300 + i) });
  await page.goto("/report-test?period=2026-10");
  await page.locator(".cr-filter-panel > summary").click();
  await expect(
    page.getByRole("heading", { name: "Contratos", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".cr-table tbody tr")).toHaveCount(61);
  await expect(
    page.getByRole("button", { name: "Próxima", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".cr-table tbody")).toContainText("10/12");
  await expect(page.locator(".cr-table tbody")).toContainText("Locação");
  await expect(
    page.getByRole("columnheader", { name: /Faturado no mês/ }),
  ).toHaveCount(1);
  await expect(page.getByRole("link", { name: /Editar OS/ })).toHaveCount(0);
});
