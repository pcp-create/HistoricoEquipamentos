import { test, expect } from "@playwright/test";
import { build } from "esbuild";
import { readFileSync } from "node:fs";
test("rescheduling requires a reason and exposes the recorded dates and author", async ({ page }) => {
  const bundle = await build({
    stdin: { contents: `import React from "react";import {createRoot} from "react-dom/client";import Edit from "./components/order-quick-edit";function Screen(){const[open,setOpen]=React.useState(true);const[result,setResult]=React.useState(null);return <>{open&&<Edit row={{company:2,id:"800",fields:{}}} field="expected" onClose={()=>setOpen(false)} onStart={()=>{}} onResult={setResult}/>}<output>{JSON.stringify(result)}</output></>}createRoot(document.getElementById("root")).render(<Screen/>);`, resolveDir: process.cwd(), loader:"tsx" },
    bundle:true,write:false,jsx:"automatic",
  });
  await page.route("**/delivery-edit-test", r => r.fulfill({contentType:"text/html",body:`<style>${readFileSync("app/globals.css","utf8")}\n${readFileSync("components/commercial-report.css","utf8")}</style><div id="root"></div><script>${bundle.outputFiles[0].text}</script>`}));
  let submitted: any;
  await page.route("**/api/service-orders**", r => {
    const params = new URL(r.request().url()).searchParams;
    if (r.request().method() === "POST") {
      const body = r.request().postDataJSON();
      if (body.action === "edit-prepare") { submitted = body; return r.fulfill({json:{state:"ready"}}); }
      return r.fulfill({json:{state:"complete"}});
    }
    if (params.has("deliveryHistory")) return r.fulfill({json:{rows:[{id:"old",created_at:"2026-10-29T10:00:00Z",created_by:"gestor@teste",state:"complete",next_step:1,change:{before:"2026-10-20",after:"2026-10-22",reason:"Aguardando aprovação do cliente"}}]}});
    return r.fulfill({json:{version:"v1",draft:{company:"2",expected:"2026-10-22"},labels:{}}});
  });
  await page.goto("/delivery-edit-test");
  await page.getByLabel("Entrega prevista", {exact:true}).fill("2026-11-10");
  await expect(page.getByRole("button",{name:"Salvar no ERP"})).toBeDisabled();
  await page.getByText("Histórico da entrega prevista",{exact:true}).click();
  await expect(page.getByText("Aguardando aprovação do cliente")).toBeVisible();
  await expect(page.getByText("20/10/2026 → 22/10/2026")).toBeVisible();
  await expect(page.getByText(/gestor@teste/)).toBeVisible();
  await page.getByLabel("Justificativa da alteração",{exact:true}).fill("Peça com entrega remarcada");
  await page.getByRole("button",{name:"Salvar no ERP"}).click();
  await expect(page.locator("output")).toContainText("2026-11-10");
  expect(submitted.draft.deliveryChangeReason).toBe("Peça com entrega remarcada");
});
