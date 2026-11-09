import { test, expect } from "@playwright/test";
import { build } from "esbuild";
import { readFileSync } from "node:fs";
import history from "../lib/billing-evolution/history.json";
import { buildEvolution, type LiveMonth } from "../lib/billing-evolution/model";
test("company and period filters, charts, export and mobile layout", async ({
  page,
}) => {
  const bundle = await build({
    stdin: {
      contents: `import React from 'react';import{createRoot}from'react-dom/client';import Screen from './components/billing-evolution';createRoot(document.getElementById('root')).render(<Screen/>);`,
      resolveDir: process.cwd(),
      loader: "tsx",
    },
    bundle: true,
    write: false,
    outdir: "out",
    jsx: "automatic",
    plugins: [
      {
        name: "mock",
        setup(b) {
          b.onResolve({ filter: /^(next\/link|\.\/site-header)$/ }, (args) => ({
            path: args.path,
            namespace: "mock",
          }));
          b.onLoad({ filter: /.*/, namespace: "mock" }, (args) => ({
            contents:
              args.path === "next/link"
                ? 'import React from"react";export default p=>React.createElement("a",p,p.children)'
                : "export default ()=>null",
            loader: "js",
            resolveDir: process.cwd(),
          }));
        },
      },
    ],
  });
  await page.route("**/evolution-test", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: `<meta name="viewport" content="width=device-width,initial-scale=1"><style>${readFileSync("app/globals.css", "utf8")}\n${bundle.outputFiles.find((f) => f.path.endsWith(".css"))!.text}</style><div id="root"></div><script>${bundle.outputFiles.find((f) => f.path.endsWith(".js"))!.text}</script>`,
    }),
  );
  let live: LiveMonth[] = [];
  await page.route("**/api/billing-evolution", (r) =>
    r.fulfill({ json: buildEvolution(history, live, "2027-01-09", null) }),
  );
  await page.goto("/evolution-test");
  await expect(
    page.getByRole("heading", { name: "Gráfico de Evolução", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("R$ 11.164.439,04").first()).toBeVisible();
  await expect(page.getByLabel("Ano final")).toHaveValue("2026");
  await expect(
    page.getByRole("heading", { name: "Participação das empresas · 2026" }),
  ).toBeVisible();
  const bar2024 = page.getByRole("button", {
    name: "Selecionar ano 2024",
    exact: true,
  });
  await bar2024.click();
  await expect(bar2024).toHaveAttribute("aria-pressed", "true");
  await expect(bar2024.locator("rect")).toHaveCSS("fill", "rgb(37, 99, 161)");
  await expect(
    page.getByRole("heading", { name: "Participação das empresas · 2024" }),
  ).toBeVisible();
  const expectedRj = history.records.find(
    (row) => row.scope === "1" && row.year === 2024,
  )!.total!;
  await expect(page.locator(".be-company-grid article").first()).toContainText(
    expectedRj.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
  );
  await page
    .getByRole("button", { name: "Selecionar ano 2026", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Participação das empresas · 2026" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Mensal", exact: true }).click();
  await expect(
    page.getByRole("img", {
      name: "Comparativo mensal de faturamento por ano",
    }),
  ).toBeVisible();
  const table = page.getByRole("region", {
    name: "Tabela de evolução do faturamento",
  });
  await expect(table.locator("tbody tr")).toHaveCount(12);
  expect(
    await table
      .locator("tbody tr")
      .first()
      .evaluate((el) => el.getBoundingClientRect().height),
  ).toBeLessThan(36);
  expect(
    await table.evaluate((el) => el.scrollHeight <= el.clientHeight + 1),
  ).toBeTruthy();
  await expect(
    table.locator('td[data-records*="Melhor do mês"]').first(),
  ).toBeVisible();
  await expect(
    table.locator('td[data-records*="Melhor do ano"]').first(),
  ).toBeVisible();
  await expect(page.getByLabel("Legenda dos melhores valores")).toBeVisible();
  await page.screenshot({
    path: "/tmp/billing-evolution-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Detalhar Jan/2026", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Detalhamento do faturamento",
  });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByText("A planilha informa apenas", { exact: false }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  live = [
    {
      company: "1",
      period: "2026-10",
      amount: 800,
      gross: 1000,
      returns: 200,
      count: 2,
      returnCount: 1,
    },
    {
      company: "2",
      period: "2026-10",
      amount: -50,
      gross: 0,
      returns: 50,
      count: 0,
      returnCount: 1,
    },
    {
      company: "27404",
      period: "2026-10",
      amount: 300,
      gross: 300,
      returns: 0,
      count: 1,
      returnCount: 0,
    },
  ];
  await page.getByRole("button", { name: "Atualizar", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Detalhar Out/2026", exact: true }),
  ).toHaveText("R$ 1.050,00");
  await page
    .getByRole("button", { name: "Detalhar Out/2026", exact: true })
    .click();
  await expect(dialog.getByRole("row", { name: /RJ Indústria/ })).toContainText(
    "R$ 1.000,00",
  );
  await expect(dialog.getByRole("row", { name: /RJ Indústria/ })).toContainText(
    "R$ 200,00",
  );
  await expect(
    dialog.getByRole("row", { name: /Total com composição completa/ }),
  ).toContainText("R$ 1.300,00");
  await expect(
    dialog.getByRole("row", { name: /Total com composição completa/ }),
  ).toContainText("R$ 250,00");
  await page.screenshot({
    path: "/tmp/billing-evolution-detail.png",
    fullPage: true,
  });
  await dialog.getByRole("button", { name: "Fechar", exact: true }).click();
  await page.getByLabel("Empresa", { exact: true }).selectOption("1");
  await page.getByLabel("Ano inicial").selectOption("2010");
  await page.getByLabel("Ano final").selectOption("2011");
  await expect(page.getByText("Somente anual").first()).toBeVisible();
  await expect(page.getByText("R$ 789.512,60")).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar tabela" }).click();
  expect((await download).suggestedFilename()).toContain("RJ Indústria");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "/tmp/billing-evolution-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});
