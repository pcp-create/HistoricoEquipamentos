import test from "node:test";
import assert from "node:assert/strict";
import {build, type Plugin} from "esbuild";
import {createRequire} from "node:module";
import {chromium} from "@playwright/test";
import {readFileSync} from "node:fs";

test("shared header hydrates matching markup before mounting utility actions", async () => {
 const mocks:Plugin={name:"header-environment",setup(b){
  b.onResolve({filter:/^(next\/(link|image|navigation)|\.\/session-access)$/},args=>({path:args.path,namespace:"mock"}));
  b.onLoad({filter:/.*/,namespace:"mock"},args=>({resolveDir:process.cwd(),loader:"jsx",contents:
   args.path==="next/navigation"?'export const useSearchParams=()=>new URLSearchParams("tab=customers");':
   args.path==="./session-access"?'export const useSessionAccess=()=>({admin:false,displayName:"Teste",modules:["crm"]});':
   args.path==="next/link"?'import React from "react";export default function Link({prefetch,children,...props}){return <a {...props}>{children}</a>}':
   'import React from "react";export default function Image({priority,fill,unoptimized,...props}){return <img {...props}/>}'}));
 }};
 const app=`import React from "react";import Header from "./components/site-header";import Actions from "./components/module-header-actions";import {Settings} from "lucide-react";
 function App(){return <><Header active="crm"/><Actions><button title="Configurações"><Settings/>Configurações</button></Actions></>}`;
 const options={bundle:true,write:false,jsx:"automatic" as const,plugins:[mocks],loader:{".css":"empty" as const}};
 const server=await build({...options,platform:"node",format:"cjs",stdin:{contents:app+';import {renderToString} from "react-dom/server";export const html=renderToString(<App/>);',resolveDir:process.cwd(),loader:"tsx"}});
 const mod={exports:{} as {html:string}};
 new Function("require","module","exports",server.outputFiles![0].text)(createRequire(import.meta.url),mod,mod.exports);
 assert.ok(mod.exports.html.includes('class="module-navigation-bar"'));
 const client=await build({...options,platform:"browser",stdin:{contents:app+';import {hydrateRoot} from "react-dom/client";window.hydrationErrors=[];hydrateRoot(document.getElementById("root"),<App/>,{onRecoverableError:e=>window.hydrationErrors.push(e.message)});',resolveDir:process.cwd(),loader:"tsx"}});
 const browser=await chromium.launch();
 try {
  const page=await browser.newPage({viewport:{width:390,height:844}});
  await page.route("**/api/**",r=>r.fulfill({status:200,contentType:"application/json",body:"{}"}));
  await page.setContent('<div id="root">'+mod.exports.html+'</div>');
  await page.addStyleTag({content:readFileSync("app/globals.css","utf8")});
  await page.addScriptTag({content:client.outputFiles![0].text});
  await page.locator("#module-header-actions").getByRole("button",{name:"Configurações"}).waitFor();
  assert.deepEqual(await page.evaluate(()=>(window as any).hydrationErrors),[]);
  assert.equal(await page.locator(".module-navigation-bar").count(),1);
  assert.equal(await page.locator(".module-breadcrumb").count(),1);
  await page.screenshot({path:"/tmp/site-header-hydration-mobile.png"});
 }finally{await browser.close();}
});
