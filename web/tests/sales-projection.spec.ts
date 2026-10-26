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
        rows: [row, { ...row, company: 2, name: "RJ Serrana" }],
        details: [
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
  await page.goto("/projection-test");
  await expect(
    page.getByRole("heading", { name: "Projeção de Vendas" }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: /Devoluções/ }).first(),
  ).toBeVisible();
  await expect(page.locator(".sp-target-gap")).toBeVisible();
  await page.getByRole("button", { name: "Set", exact: true }).click();
  await expect.poll(() => periods.at(-1)?.endsWith("-09")).toBe(true);
  await page.getByRole("combobox", { name: "Empresa" }).selectOption("1");
  await expect(page.locator(".sp-table-scroll tbody tr")).toHaveCount(1);
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
  await page.screenshot({
    path: "test-results/sales-projection-mobile.png",
    fullPage: true,
  });
});
