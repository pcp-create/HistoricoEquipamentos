import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';
import {readFileSync} from 'node:fs';

test('order dialog selects proposal payment, locks a single type and submits the changed payment',async()=>{
 const bundle=await build({stdin:{contents:'import React from "react";import {createRoot} from "react-dom/client";import Proposal from "./components/crm-proposal";createRoot(document.getElementById("root")).render(<Proposal id="test"/>);',resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,jsx:'automatic',loader:{'.css':'empty'},plugins:[{name:'fixtures',setup(b){
  b.onResolve({filter:/.*/},a=>{if(a.path==='next/link'||(a.importer.endsWith('/crm-proposal.tsx')&&a.path.startsWith('./')&&!a.path.endsWith('.css')))return {path:a.path,namespace:'fixture'};});
  b.onLoad({filter:/.*/,namespace:'fixture'},a=>({loader:'tsx',resolveDir:process.cwd(),contents:
   a.path==='next/link'?'export default function Link(p){return <a {...p}/>;}':
   a.path==='./new-service-order'?'export default function Order({proposal}){return <main className="new-os">{proposal.headerActions}{proposal.stageActions}</main>}':
   a.path==='./crm-api'?`export const crmStatus=s=>s;export const crmDate=s=>s;export async function crmApi(q,body){
    if(body?.action==='price-review')return {items:[],approved:true};
    if(body?.action==='convert'){window.submitted=body;return {state:'complete'};}
    if(q.includes('catalogs'))return {proposalTypes:[{id:1,order_types:window.types.map(t=>String(t.id))}],orderTypes:window.types};
    return {id:'test',number:9,title:'Teste',status:'pending',version:1,type_id:1,links:[],workflow:{state:'reviewed'},document:{payment:'1',type:'41',items:[],commercial:{paymentName:'À vista'}}};
   }`:'export default function Stub(){return null;}' }));
 }}]});
 const browser=await chromium.launch();
 try{
  for(const count of [1,2]){
   const page=await browser.newPage({viewport:{width:390,height:844}});
   await page.route('http://crm.test/**',r=>r.fulfill({contentType:'text/html',body:'<div id="root"></div>'}));
   await page.route('**/api/service-orders?lookup=metadata',r=>r.fulfill({json:{registries:[{kind:'payment-terms',id:'1',name:'À vista'},{kind:'payment-terms',id:'2',name:'Boleto 28 dias'}]}}));
   await page.goto('http://crm.test/');
   await page.evaluate("Object.defineProperty(window.crypto,'randomUUID',{value:()=> '00000000-0000-4000-8000-000000000001'})");
   await page.evaluate(`window.types=${JSON.stringify([{id:41,name:'Partida técnica',active:true},...(count===2?[{id:42,name:'Oficina',active:true}]:[])])}`);
   await page.addStyleTag({content:readFileSync('app/globals.css','utf8')+readFileSync('components/crm.css','utf8')});
   await page.addScriptTag({content:bundle.outputFiles[0].text});
   await page.getByRole('button',{name:'Pedido de Venda',exact:true}).click();
   const dialog=page.getByRole('dialog',{name:'Confirmar Pedido de Venda'});
   await dialog.waitFor();
   assert.equal(await dialog.getByLabel('Tipo de OS a gerar',{exact:true}).isDisabled(),count===1);
   assert.equal(await dialog.getByLabel('Condição de pagamento',{exact:true}).inputValue(),'1');
   await dialog.getByRole('switch').click();
   await dialog.getByLabel('Condição de pagamento',{exact:true}).selectOption('2');
   assert.equal(await dialog.getByRole('switch').getAttribute('aria-checked'),'false');
   await dialog.getByRole('switch').click();
   await dialog.getByPlaceholder('Nome do aprovador no cliente').fill('Ana');
   assert.equal(await dialog.getByRole('button',{name:'Cancelar',exact:true}).locator('svg').count(),1);
   assert.equal(await dialog.getByRole('button',{name:'Confirmar e gerar OS'}).locator('svg').count(),1);
   await page.screenshot({path:`/tmp/crm-order-confirmation-${count}.png`});
   await dialog.getByRole('button',{name:'Confirmar e gerar OS'}).click();
   await page.waitForFunction('window.submitted');
   assert.equal(await page.evaluate('window.submitted.confirmation.payment'),'2');
   await page.close();
  }
 }finally{await browser.close();}
});
