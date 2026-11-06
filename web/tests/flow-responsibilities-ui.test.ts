import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createServer} from 'node:http';
import {chromium,expect} from '@playwright/test';
test('registry flow area and treatment recipient save independently and recover after reopening',async()=>{
 const compiled=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import Settings,{FlowAreaSelect}from'./components/schedule-flow-responsibilities';createRoot(document.getElementById('root')).render(<><FlowAreaSelect id='18' name='Liberado para faturamento' area='Faturamento'/><Settings/></>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,outfile:'app.js',platform:'browser',jsx:'automatic'});
 const server=createServer((req,res)=>{if(req.url==='/app.js'){res.setHeader('Content-Type','text/javascript');res.end(compiled.outputFiles[0].text);}else{res.setHeader('Content-Type','text/html');res.end('<div id="root"></div><script src="/app.js"></script>');}});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch();
 try{
 const page=await browser.newPage();const writes:any[]=[];
 const config={statuses:[],areas:[{area:'Faturamento',recipient:''},{area:'Comercial',recipient:''}],users:[{email:'finance@test.com',display_name:'Responsável faturamento'}]};
 await page.route('**/api/service-scheduling/flow-responsibilities',async route=>{if(route.request().method()==='POST'){const body=route.request().postDataJSON();writes.push(body);if(body.action==='recipient')config.areas.find(a=>a.area===body.area)!.recipient=body.recipient;}await route.fulfill({json:config});});
 await page.goto('http://127.0.0.1:'+(server.address() as any).port);
 await page.getByLabel('Responsável Status Fluxo · Liberado para faturamento').selectOption('Comercial');
 await expect(page.getByLabel('Responsável Status Fluxo · Liberado para faturamento')).toHaveValue('Comercial');
 assert.deepEqual(writes[0],{action:'status',id:'18',area:'Comercial'});
 await page.getByLabel('Usuário de Faturamento').selectOption('finance@test.com');
 await expect(page.getByRole('status')).toContainText('Responsável de Faturamento salvo.');
 assert.deepEqual(writes[1],{action:'recipient',area:'Faturamento',recipient:'finance@test.com'});
 await page.reload();await expect(page.getByLabel('Usuário de Faturamento')).toHaveValue('finance@test.com');
 await page.getByLabel('Usuário de Faturamento').selectOption('');
 await expect(page.getByLabel('Usuário de Faturamento')).toHaveValue('');
 }finally{await browser.close();await new Promise<void>(r=>server.close(()=>r()));}
});
