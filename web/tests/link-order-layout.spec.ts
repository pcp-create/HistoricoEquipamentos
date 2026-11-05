import { test, expect } from "@playwright/test";
import { build } from "esbuild";
import { readFileSync } from "node:fs";
test("link picker supports search, selection and removal on mobile", async ({page}) => {
  const bundle = await build({
    stdin:{contents:`import React from "react";import{createRoot}from"react-dom/client";import Picker from "./components/link-order";import "./components/create-linked-task.css";createRoot(document.getElementById("root")).render(<dialog open className="linked-task-dialog order-link-dialog"><header className="order-link-dialog-heading"><div><h2>Vincular OS</h2><p>Relacione outra ordem de serviço a esta OS.</p></div><button aria-label="Fechar">×</button></header><Picker company={1} id="10" initiallyOpen/></dialog>);`,resolveDir:process.cwd(),loader:"tsx"},
    bundle:true,write:false,outdir:"out",jsx:"automatic",
  });
  await page.route("**/link-layout-test",r=>r.fulfill({contentType:"text/html",body:`<meta name="viewport" content="width=device-width,initial-scale=1"><style>${readFileSync("app/globals.css","utf8")}\n${bundle.outputFiles.find(f=>f.path.endsWith(".css"))!.text}</style><body class="operational-ui"><div id="root"></div><script>${bundle.outputFiles.find(f=>f.path.endsWith(".js"))!.text}</script></body>`}));
  const order={company_id:2,id:"20",number:"14818",cliente_nome:"Cliente com nome extenso para validar a apresentação no celular",equipamento:"Compressor de parafuso GA55",status_lancamento_nome:"5 - MATERIAL SEPARADO RIO DO SUL"};
  let target: any;let links:any[]=[];const other={...order,id:"21",number:"14819"};
  await page.route("**/api/orders/1/10/link**",r=>{
    if(r.request().method()==="POST"){const body=r.request().postDataJSON();target=body.target;links=body.action==='remove'?links.filter(l=>l.linked_order_id!==target.id):[...links,{linked_company_id:2,linked_order_id:target.id,numero_sequencia:target.id==='20'?'14818':'14819',cliente_nome:order.cliente_nome,version:2}];return r.fulfill({json:{links}});}
    return r.fulfill({json:new URL(r.request().url()).searchParams.has("q")?{orders:[order,other],hasMore:false}:{link:null}});
  });
  await page.setViewportSize({width:390,height:844});
  await page.goto("/link-layout-test");
  await page.getByRole("textbox",{name:"Pesquisar ordem de serviço"}).fill("14818");
  await page.getByRole("button",{name:/OS-14818/}).click();
  await expect(page.locator(".order-link-current")).toContainText("OS-14818");
  await expect(page.locator(".order-link-current")).toContainText(order.cliente_nome);
  expect(target).toEqual({company:2,id:"20"});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:"test-results/link-order-mobile.png",fullPage:true});
  await page.getByRole("button",{name:/OS-14819/}).click();
  await expect(page.locator(".order-link-current.has-link")).toHaveCount(2);
  await page.locator(".order-link-current.has-link").filter({hasText:"OS-14818"}).getByRole("button",{name:"Remover",exact:true}).click();
  await expect(page.locator(".order-link-current.has-link")).toHaveCount(1);
  await expect(page.locator(".order-link-current.has-link")).toContainText("OS-14819");
  await page.getByRole("button",{name:"Remover",exact:true}).click();
  await expect(page.locator(".order-link-current")).toContainText("Nenhuma OS vinculada");
  expect(target).toEqual({company:2,id:"21"});
});
