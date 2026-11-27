import test from "node:test";
import assert from "node:assert/strict";
import {build, type Plugin} from "esbuild";
import {readFileSync} from "node:fs";
import {chromium} from "@playwright/test";

test("mobile CRM keeps search and views compact and expands status on demand",async()=>{
 const mocks:Plugin={name:"crm-layout-data",setup(b){
  b.onResolve({filter:/.*/},a=>{
   if(a.path==="next/navigation"||a.path==="next/link"||(a.importer.endsWith("/crm.tsx")&&a.path.startsWith("./")&&!a.path.endsWith(".css")))return {path:a.path,namespace:"mock"};
  });
  b.onLoad({filter:/.*/,namespace:"mock"},a=>({resolveDir:process.cwd(),loader:"tsx",contents:
   a.path==="next/navigation"?'export const useSearchParams=()=>new URLSearchParams(window.location.search);export const useRouter=()=>({push(){}});':
   a.path==="next/link"?'import React from "react";export default function Link({children,...p}){return <a {...p}>{children}</a>}':
   a.path==="./session-access"?'export const useSessionAccess=()=>({visitManager:false});':
   a.path==="./crm-api"?'export const crmStatus=s=>s;export const crmMoney=v=>String(v);export const crmDate=v=>String(v);export async function crmApi(q){window.queries.push(q);if(q.includes("proposalEmailSettings"))return null;if(q.includes("overview"))return {conversion:22.2,opportunities:9,converted:2,leads:70,visits:{completed:125},opportunity_value:120000,sales_value:30000,opportunities_without_value:1};if(q.includes("catalogs"))return {};if(q.includes("kind=proposals"))return {rows:[{id:"proposal-test",number:8,title:"Proposta teste",status:"creating",total_cents:12000,customer_name:"Cliente teste",opportunity_number:4}],total:1};return {rows:[],total:0};}':
   'export default function Stub(){return null;}'}));
 }};
 const js=await build({stdin:{contents:'import React from "react";import {createRoot} from "react-dom/client";import Crm from "./components/crm";window.queries=[];createRoot(document.getElementById("root")).render(<Crm/>);',resolveDir:process.cwd(),loader:"tsx"},plugins:[mocks],bundle:true,write:false,jsx:"automatic",loader:{".css":"empty"}});
 const browser=await chromium.launch();
 try {
  const page=await browser.newPage({viewport:{width:390,height:844}});
  await page.route("http://crm.test/**",r=>r.fulfill({contentType:"text/html",body:'<div id="root"></div>'}));
  await page.goto("http://crm.test/?tab=opportunities");
  await page.addStyleTag({content:readFileSync("app/globals.css","utf8")+readFileSync("components/crm.css","utf8")});
  await page.addScriptTag({content:js.outputFiles[0].text});
  await page.getByRole("heading",{name:"Oportunidades"}).waitFor();
  const mine=page.getByRole("button",{name:"Minhas oportunidades",exact:true});
  await mine.click();
  await page.waitForFunction(()=>(window as any).queries.some((q:string)=>q.includes("kind=opportunities")&&q.includes("mine=1")));
  assert.equal(await mine.getAttribute("aria-pressed"),"true");
  await mine.click();
  assert.equal(await mine.getAttribute("aria-pressed"),"false");
  const status=page.getByLabel("Status",{exact:true});
  assert.equal(await status.isVisible(),false);
  assert.equal(await page.getByRole("textbox",{name:"Pesquisar",exact:true}).isVisible(),false);
  await page.getByRole("button",{name:"Filtros",exact:true}).click();
  await status.waitFor({state:"visible",timeout:5000});
  await status.selectOption("lost");
  await page.getByRole("button",{name:"Filtros (1)"}).click();
  await status.waitFor({state:"hidden"});
  await page.getByRole("button",{name:"Kanban",exact:true}).click();
  await page.locator(".crm-kanban").waitFor();
  const search=page.getByRole("textbox",{name:"Pesquisar",exact:true});
  await page.getByRole("button",{name:"Filtros (1)"}).click();
  await search.fill("teste");await search.press("Enter");
  await page.waitForFunction(()=>(window as any).queries.some((q:string)=>q.includes("q=teste")));
  for(const width of [390,320]){
   await page.setViewportSize({width,height:844});
   for(const selector of [".crm-filter",".crm-filter-actions",".crm-list-heading",".crm-view-switch"]){
    const b=await page.locator(selector).boundingBox();assert.ok(b&&b.x>=0&&b.x+b.width<=width);
   }
  }
  await page.screenshot({path:"/tmp/crm-mobile-compact.png"});
  await page.setViewportSize({width:1280,height:800});
  if (!(await status.isVisible())) await page.getByRole("button",{name:/^Filtros/}).click();
  assert.equal(await status.isVisible(),true);
  assert.equal(await page.getByRole("button",{name:"Filtros (2)"}).isVisible(),true);
  await page.getByRole("button",{name:"Propostas",exact:true}).click();
  assert.equal(await page.locator(".crm-search-field input").inputValue(),"");
  assert.equal(await page.locator(".crm-status-filter select").inputValue(),"");
  await page.getByRole("button",{name:"Oportunidades",exact:true}).click();
  assert.equal(await page.locator(".crm-search-field input").inputValue(),"teste");
  assert.equal(await page.locator(".crm-status-filter select").inputValue(),"lost");
  await page.getByRole("button",{name:"Propostas",exact:true}).click();
  await page.getByRole("button",{name:"Kanban",exact:true}).click();
  const card=page.locator(".crm-kanban-card").first();
  await card.waitFor();
  assert.equal(await card.getByRole("button",{name:"OP-4"}).count(),0);
  await card.click({position:{x:20,y:85}});
  await page.waitForURL("**/crm/propostas/proposal-test");
  await page.goto("http://crm.test/?tab=proposals");
  await page.addStyleTag({content:readFileSync("app/globals.css","utf8")+readFileSync("components/crm.css","utf8")});
  await page.addScriptTag({content:js.outputFiles[0].text});
  await page.locator(".crm-kanban-card").first().waitFor();
  assert.equal(await page.getByRole("button",{name:"Kanban",exact:true}).getAttribute("aria-pressed"),"true");
  await page.getByRole("button",{name:"Oportunidades",exact:true}).click();
  assert.equal(await page.getByRole("button",{name:"Kanban",exact:true}).getAttribute("aria-pressed"),"true");
  await page.setViewportSize({width:390,height:844});
  for(const tab of ["Leads","Clientes","Contatos"]){
   await page.getByRole("button",{name:tab,exact:true}).click();
   assert.equal(await page.getByRole("button",{name:/^Filtros/}).count(),0);
   assert.equal(await page.getByRole("textbox",{name:"Pesquisar",exact:true}).isVisible(),true);
   assert.equal(await page.getByRole("button",{name:"Pesquisar",exact:true}).count(),0);
  }
  // All CRM list searches apply typing and clearing without submitting the form.
  for(const [tab,kind] of [["Leads","leads"],["Clientes","customers"],["Contatos","contacts"],["Oportunidades","opportunities"],["Propostas","proposals"],["Pedidos (OSs)","orders"]]){
   await page.getByRole("button",{name:tab,exact:true}).click();
   const filter=page.getByRole("button",{name:/^Filtros/});
   if(await filter.count())await filter.click();
   const input=page.getByRole("textbox",{name:"Pesquisar",exact:true});
   await page.evaluate(()=>{(window as any).queries=[];});
   await input.fill("Cliente");
   await page.waitForFunction((kind)=>(window as any).queries.some((q:string)=>{const p=new URLSearchParams(q);return p.get('kind')===kind&&p.get('q')==='Cliente'&&p.get('page')==='1';}),kind);
   await input.fill("");
   await page.waitForFunction((kind)=>(window as any).queries.some((q:string)=>{const p=new URLSearchParams(q);return p.get('kind')===kind&&p.get('q')==='';}),kind);
  }
  await page.getByRole("button",{name:"Leads",exact:true}).click();
  await page.getByRole("textbox",{name:"Pesquisar",exact:true}).fill("Somente leads");
  // Switch before debounce applies: the pending lead search must not reach Customers.
  await page.getByRole("button",{name:"Clientes",exact:true}).click();
  assert.equal(await page.getByRole("textbox",{name:"Pesquisar",exact:true}).inputValue(),"");
  await page.getByRole("textbox",{name:"Pesquisar",exact:true}).fill("Somente clientes");
  await page.waitForFunction(()=>(window as any).queries.some((q:string)=>{const p=new URLSearchParams(q);return p.get('kind')==='customers'&&p.get('q')==='Somente clientes';}));
  await page.getByRole("button",{name:"Leads",exact:true}).click();
  assert.equal(await page.getByRole("textbox",{name:"Pesquisar",exact:true}).inputValue(),"Somente leads");
  await page.waitForFunction(()=>(window as any).queries.some((q:string)=>{const p=new URLSearchParams(q);return p.get('kind')==='leads'&&p.get('q')==='Somente leads';}));
  await page.getByRole("button",{name:"Visão geral",exact:true}).click();
  await page.locator('.crm-funnel-sales-value strong').waitFor();
  assert.match(await page.locator('.crm-funnel-sales-value strong').innerText(),/30.000,00/);
  for(const width of [390,1440]){
   await page.setViewportSize({width,height:1000});
   const positions:any=await page.evaluate(`(()=>{
    const box=(selector)=>{const r=document.querySelector(selector).getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom};};
    return {chart:box('.crm-funnel-chart'),conversion:box('.crm-funnel-conversion'),value:box('.crm-funnel-opportunity-value'),scroll:document.documentElement.scrollWidth};
   })()`);
   assert.ok(positions.scroll<=width,'no horizontal page overflow');
   if(width===1440){assert.ok(positions.value.x>=positions.chart.right);assert.ok(positions.conversion.right<=positions.chart.x);}
   else assert.ok(positions.value.y>=positions.chart.bottom);
   await page.screenshot({path:`/tmp/crm-funnel-${width}.png`,fullPage:true});
  }
 } finally {await browser.close();}
});
