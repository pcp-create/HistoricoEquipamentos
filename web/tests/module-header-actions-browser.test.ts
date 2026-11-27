import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

test("module actions share navigation, retain handlers and fit mobile", async () => {
 const compiled = await build({stdin:{contents:`
 import React from "react"; import {createRoot} from "react-dom/client";
 import Actions from "./components/module-header-actions";
 import {Settings, RefreshCw} from "lucide-react";
 function App(){const [count,setCount]=React.useState(0),[visible,setVisible]=React.useState(true);
 return <><div className="module-navigation-bar"><nav className="topnav module-breadcrumb"><a>Módulos</a><a>Comercial</a><span>CRM</span></nav><div id="module-header-actions" className="module-header-actions"/></div>
 <main><Actions><button onClick={()=>setCount(n=>n+1)}><RefreshCw/>Atualizar</button></Actions>
 {visible&&<Actions><button disabled><Settings/>Configurações</button></Actions>}
 <button onClick={()=>setVisible(false)}>Ocultar configuração</button><output>{count}</output></main></>}
 createRoot(document.getElementById("root")).render(<App/>);`,resolveDir:process.cwd(),loader:"tsx"},bundle:true,write:false,platform:"browser",jsx:"automatic"});
 const browser = await chromium.launch();
 try {
  const page=await browser.newPage({viewport:{width:1280,height:800}});
  await page.setContent('<div id="root"></div>');
  await page.addStyleTag({content:readFileSync("app/globals.css","utf8")});
  await page.addScriptTag({content:compiled.outputFiles[0].text});
  const toolbar=page.locator("#module-header-actions");
  await toolbar.getByRole("button",{name:"Atualizar"}).click();
  assert.equal(await page.locator("output").textContent(),"1");
  assert.equal(await toolbar.getByRole("button",{name:"Configurações"}).isDisabled(),true);
  assert.equal(await page.locator("main").getByRole("button",{name:"Atualizar"}).count(),0);
  for(const width of [1280,390,320]){
   await page.setViewportSize({width,height:800});
   const nav=await page.locator(".module-navigation-bar").boundingBox();
   const actions=await toolbar.boundingBox();
   assert.ok(nav&&actions&&actions.x>=0&&actions.x+actions.width<=width);
   for(const button of await toolbar.getByRole("button").all()){
    const bounds=await button.boundingBox();
    assert.ok(bounds&&nav&&bounds.y>=nav.y&&bounds.y+bounds.height<=nav.y+nav.height);
    assert.equal(bounds.height,40);
   }
  }
  await page.screenshot({path:"/tmp/module-header-actions-mobile.png"});
  await page.getByRole("button",{name:"Ocultar configuração"}).click();
  assert.equal(await toolbar.getByRole("button").count(),1);
 } finally { await browser.close(); }
});
