import { test, expect } from "@playwright/test";
import { build } from "esbuild";
import { readFileSync } from "node:fs";
test("manager freezes summary, compares latest snapshot and remains usable on mobile", async ({ page }) => {
  const row = { company: 1, name: "RJ Indústria", contracts: 100, contractBilled: 50, salesBilled: 0, salesPending: 200, other: 0, returns: 0, billed: 50, pending: 250, projection: 300, contractPending: 50 };
  const detail = { company: 1, kind: "salesPending", id: "10", name: "Cliente", date: "2026-10-01", amount: 200, fields: { flowOwner: "Comercial" } };
  const live = { rows: [row], details: [detail], target: 500, complete: true, updatedAt: "2026-10-26T15:00:00Z" };
  const snapshots: any[] = [];
  const bundle = await build({
    stdin: { contents: `import React from 'react';import{createRoot}from'react-dom/client';import Screen from './components/commercial-management';createRoot(document.getElementById('root')).render(<Screen mode={location.search.includes('changes')?'changes':'summary'}/>);`, resolveDir: process.cwd(), loader: "tsx" },
    bundle: true, write: false, outdir: "out", jsx: "automatic",
    plugins: [{ name: "mock", setup(b) {
      b.onResolve({ filter: /^(next\/link|\.\/site-header)$/ }, (args) => ({ path: args.path, namespace: "mock" }));
      b.onLoad({ filter: /.*/, namespace: "mock" }, (args) => ({
        contents: args.path === "next/link" ? 'import React from "react";export default p=>React.createElement("a",p,p.children)' : "export default ()=>null",
        loader: "js", resolveDir: process.cwd(),
      }));
    } }],
  });
  await page.route("**/management-test?*", (r) => r.fulfill({ contentType: "text/html", body: `<meta name="viewport" content="width=device-width,initial-scale=1"><style>${readFileSync("app/globals.css","utf8")}\n${bundle.outputFiles.find(f=>f.path.endsWith(".css"))!.text}</style><div id="root"></div><script>${bundle.outputFiles.find(f=>f.path.endsWith(".js"))!.text}</script>` }));
  await page.route("**/api/sales-projection?*", (r) => r.fulfill({ json: live }));
  await page.route("**/api/sales-projection/snapshots**", (r) => {
    if (r.request().method() === "POST") {
      const input = r.request().postDataJSON();
      const snapshot = { ...input, created_at: "2026-10-26T15:00:00Z", created_by: "gestao", document: structuredClone(live) };
      snapshots.push(snapshot);
      return r.fulfill({ json: snapshot, status: 201 });
    }
    const id = new URL(r.request().url()).searchParams.get("id");
    return r.fulfill({ json: id ? snapshots.find(s=>s.id===id) : { rows: [...snapshots].reverse() } });
  });
  await page.goto("/management-test?summary");
  await expect(page.getByRole("heading", { name: "Resumo gerencial" })).toBeVisible();
  await page.getByRole("button", { name: "Registrar parcial agora" }).click();
  await expect(page.getByText(/Parcial registrada/)).toBeVisible();
  await expect(page.getByLabel("Visualização")).toHaveValue("snapshot");
  await expect(page.getByText(/Parcial:.*gestao/)).toBeVisible();
  live.details = [{ ...detail, amount: 250 }, { ...detail, id: "11", name: "Cliente novo", amount: 100 }];
  live.rows = [{ ...row, salesPending: 350, pending: 400, projection: 450 }];
  await page.goto("/management-test?changes");
  await expect(page.getByRole("cell", { name: "Cliente novo", exact: true })).toBeVisible();
  await expect(page.locator(".cm-changes tbody tr")).toHaveCount(2);
  await expect(page.locator(".cm-kpi-projection .cm-variation-value")).toContainText("150,00");
  await expect(page.locator(".cm-kpi-gap .cm-variation-value")).toContainText("−R$");
  await expect(page.locator(".cm-kpi-target .cm-variation-value")).toHaveCount(0);
  await page.getByLabel("Movimentação", { exact: true }).selectOption("Entrada");
  await expect(page.locator(".cm-changes tbody tr")).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
