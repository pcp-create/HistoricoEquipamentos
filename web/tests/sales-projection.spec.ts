import { test, expect } from "@playwright/test";
import { build } from "esbuild";
import { readFileSync } from "node:fs";
const row = {
  company: 1,
  name: "RJ Indústria",
  contracts: 97352.74,
  contractBilled: 97352.74,
  salesBilled: 353643.66,
  salesPending: 373147.33,
  other: -2399.98,
  returns: 1805.25,
  billed: 446791.17,
  pending: 373147.33,
  projection: 819938.5,
  contractPending: 0,
};
test("periods, companies, document details and mobile layout", async ({
  page,
}) => {
  page.on("pageerror", (e) => console.log("BROWSER", e.message));
  const bundle = await build({
    stdin: {
      contents: `import React from 'react';import {createRoot} from 'react-dom/client';import Screen from './components/sales-projection';createRoot(document.getElementById('root')).render(<Screen/>);`,
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
  await page.route("**/projection-test", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: `<meta name="viewport" content="width=device-width,initial-scale=1"><style>${readFileSync("app/globals.css", "utf8")}\n${bundle.outputFiles.find((f) => f.path.endsWith(".css"))!.text}</style><div id="root"></div><script>${bundle.outputFiles.find((f) => f.path.endsWith(".js"))!.text}</script>`,
    }),
  );
  const periods: string[] = [];
  await page.route("**/api/sales-projection?*", (r) => {
    periods.push(new URL(r.request().url()).searchParams.get("period")!);
    return r.fulfill({
      json: {
        period: periods.at(-1),
        closing:{status:"closed",label:"Fechamento de teste",capturedAt:"2026-10-31T23:00:00Z"},
        rows: [row, { ...row, company: 2, name: "RJ Serrana" }],
        details: [
          {
            company: 1, kind: "salesBilled", id: "14897",
            name: "CLIENTE PARCIAL", date: "2026-10-01", amount: 2885,
            billing: { state: "partial", balance: 2400, billed: 485, documents: [] },
          },
          {
            company: 1,
            kind: "returns",
            id: "1",
            name: "CLIENTE EXEMPLO",
            date: "2026-10-01",
            amount: 1805.25,
          },
        ],
        target: 1600000,
        complete: true,
        updatedAt: "2026-10-26T14:40:00Z",
      },
    });
  });
  await page.clock.install({time:new Date("2026-11-15T15:00:00Z")});
  await page.goto("/projection-test");
  await expect(
    page.getByRole("heading", { name: "Projeção de Vendas" }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "Faturado líquido", exact:true }).first(),
  ).toBeVisible();
  await expect(page.locator(".sp-target-gap")).toBeVisible();
  await expect(page.getByRole("columnheader",{name:"A faturar",exact:true})).toBeVisible();
  const beforePoll = periods.length;
  await page.clock.fastForward(60000);
  await expect.poll(() => periods.length).toBeGreaterThan(beforePoll);
  await expect(page.locator(".sp-target-gap")).toBeVisible();
  await expect(page.locator(".sp-billing-review")).toHaveCount(0);
  await expect(page.getByRole("columnheader", { name: "Fat. OSs", exact: true })).toHaveCount(0);
  await expect(page.getByRole("columnheader", { name: "Contratos pendentes", exact: true })).toBeVisible();
  await expect(page.getByRole("link",{name:"Acompanhamento",exact:true})).toHaveAttribute("href",/\/comercial\/acompanhamento\?period=\d{4}-\d{2}&company=all$/);
  await expect(page.getByRole("columnheader", { name: "Saldo a conferir", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Set", exact: true }).click();
  await expect.poll(() => periods.at(-1)?.endsWith("-09")).toBe(true);
  await expect(page.getByRole("columnheader",{name:"Saldo não realizado",exact:true})).toBeVisible();
  await expect(page.getByRole("columnheader",{name:/Devoluções \/ estornos/})).toBeVisible();
  await expect(page.locator('.sp-table-scroll tbody tr').first().locator('[data-column="pending"]')).toHaveText('371.342,08');
  await expect(page.locator('.sp-table-scroll tbody tr').first().locator('[data-column="returns"]')).toHaveText('1.805,25');
  await expect(page.locator('.sp-table-scroll tfoot [data-column="pending"]')).toHaveText('742.684,16');
  const exported = page.waitForEvent('download');
  await page.getByRole('button',{name:'Exportar',exact:true}).click();
  const csv=readFileSync((await (await exported).path())!,'utf8');
  expect(csv).toContain('Devoluções / estornos');
  expect(csv).toContain('"371.342,08";"1.805,25"');

  await expect(page.getByRole("columnheader",{name:"A faturar",exact:true})).toHaveCount(0);
  await expect(page.locator(".sp-target-gap")).toContainText("Diferença para a meta");
  await expect(page.locator(".sp-kpis")).toContainText("Parcela da projeção não realizada em faturamento no período");
  await page.getByRole("combobox", { name: "Empresa" }).selectOption("1");
  await expect(page.locator(".sp-table-scroll tbody tr")).toHaveCount(1);
  await expect(page.getByRole("link",{name:"Acompanhamento",exact:true})).toHaveAttribute("href",/period=\d{4}-09&company=1$/);
  await page.getByRole("button", { name: /Devoluções/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText("CLIENTE EXEMPLO");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("combobox", { name: "Empresa" }).selectOption("all");
  await page.screenshot({
    path: "test-results/sales-projection-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  for(const width of [320,390]){
    await page.setViewportSize({width,height:844});
    const panel=page.locator('.sp-company-summary');
    await expect(panel.getByRole('columnheader')).toHaveCount(4);
    await expect(panel.getByRole('columnheader',{name:'Empresa',exact:true})).toBeVisible();
    await expect(panel.getByRole('columnheader',{name:'Projeção',exact:true})).toBeVisible();
    await expect(panel.getByRole('columnheader',{name:'Faturado líquido',exact:true})).toBeVisible();
    await expect(panel.getByRole('columnheader',{name:'Realizado',exact:true})).toBeVisible();
    expect(await panel.locator('.sp-table-scroll').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
    expect(await panel.locator('tbody td[data-column="projection"]').evaluateAll(els=>els.every(el=>el.scrollWidth<=el.clientWidth))).toBe(true);
  }
  await page.screenshot({
    path: "test-results/sales-projection-mobile.png",
    fullPage: true,
  });
});
