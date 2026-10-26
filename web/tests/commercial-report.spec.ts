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
      date: "2026-10-30",
      amount: 100,
      fields: {
        sourceCompany: 1,
        flowStatus: "Revisada",
        expected: "2026-10-30",
        equipment: "Compressor",
        notes: "Observação longa",
        seller: "Ana",
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
  await expect(page.locator(".cr-table tbody tr")).toHaveCount(2);
  await expect(
    page.getByRole("link", { name: "Editar OS 101" }),
  ).toHaveAttribute("href", /returnTo=.*comercial/);
  await expect(page.getByRole("link", { name: "Editar OS 102" })).toHaveCount(
    0,
  );
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
  const checkbox = dialog.getByRole("checkbox", { name: "Selecionar tudo", exact: true });
  expect(await checkbox.evaluate(el=>getComputedStyle(el).height)).toBe("16px");
  expect(await checkbox.evaluate(el=>getComputedStyle(el.parentElement!).flexDirection)).toBe("row");
  expect(await page.getByRole("button",{name:"Filtrar Vendedor",exact:true}).evaluate(el=>getComputedStyle(el).borderTopWidth)).toBe("0px");
  await expect(dialog.getByRole("button",{name:"Aplicar",exact:true})).toBeVisible();
  await page.screenshot({path:'test-results/commercial-column-filter.png',fullPage:true});
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
  for (let i=0;i<60;i++) details.push({...details[0],id:String(300+i)});
  await page.goto("/report-test?period=2026-10");
  await expect(
    page.getByRole("heading", { name: "Contratos", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".cr-table tbody tr")).toHaveCount(61);
  await expect(page.getByRole("button", {name:"Próxima",exact:true})).toHaveCount(0);
  await expect(page.locator(".cr-table tbody")).toContainText("10/12");
  await expect(page.locator(".cr-table tbody")).toContainText("Locação");
  await expect(
    page.getByRole("columnheader", { name: /Faturado no mês/ }),
  ).toHaveCount(1);
  await expect(page.getByRole("link", { name: /Editar OS/ })).toHaveCount(0);
});
