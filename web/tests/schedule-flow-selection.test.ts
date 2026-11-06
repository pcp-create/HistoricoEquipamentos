import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createServer} from 'node:http';
import {chromium,expect} from '@playwright/test';
test('flow status searches by text or ID, retains click and keyboard choices and submits the selected ID',async()=>{
 const compiled=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import Actions from './components/schedule-order-actions';createRoot(document.getElementById('root')).render(<Actions data={{schedule:{company_id:1,order_id:14811},operations:[]}} onChanged={()=>{window.changed=true}}/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,outfile:'app.js',platform:'browser',jsx:'automatic'});
 const server=createServer((req,res)=>{const file=compiled.outputFiles.find(f=>f.path.endsWith(req.url==='/app.css'?'.css':'.js'));if(req.url==='/app.js'||req.url==='/app.css'){res.setHeader('Content-Type',req.url==='/app.js'?'text/javascript':'text/css');res.end(file!.text);return;}res.setHeader('Content-Type','text/html');res.end('<div id="root"></div><link rel="stylesheet" href="/app.css"><script src="/app.js"></script>');});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch();
 try{
 const page=await browser.newPage();let submitted:any;
 await page.route('**/api/**',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.pathname==='/api/warehouse')return route.fulfill({json:{rows:[{id:8,name:'Serviço agendado'},{id:12,name:'Liberado faturamento'},{id:13,name:'Aguardando revisão'}]}});
  if(url.pathname.endsWith('/attachments'))return route.fulfill({json:{rows:[]}});
  if(request.method()==='GET')return route.fulfill({json:{version:'v1',draft:{notes:'Texto original',internalNotes:'Interna',flowStatus:'8'},labels:{flowStatus:'Serviço agendado'}}});
  const body=request.postDataJSON();if(body.action==='edit-prepare')submitted=body;
  return route.fulfill({json:{state:'complete'}});
 });
 await page.goto('http://127.0.0.1:'+(server.address() as any).port);
 await page.getByRole('button',{name:'Editar observações e Status Fluxo'}).click();
 const input=page.getByRole('combobox',{name:'Status Fluxo'});
 await expect(input).toHaveValue('Serviço agendado');
 await input.fill('faturamento');await expect(page.getByRole('option')).toHaveCount(1);
 await page.getByRole('option',{name:/Liberado faturamento/}).click();
 await expect(input).toHaveValue('Liberado faturamento');
 await page.getByLabel('Observação',{exact:true}).fill('Observação ajustada');
 await expect(input).toHaveValue('Liberado faturamento');
 await input.fill('13');await input.press('ArrowDown');await input.press('Enter');
 await expect(input).toHaveValue('Aguardando revisão');
 await input.fill('faturamento');await input.press('Escape');
 await expect(input).toHaveValue('Aguardando revisão');
 await page.getByRole('button',{name:'Salvar no ERP',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('atualizados no ERP');
 assert.equal(submitted.draft.flowStatus,'13');assert.equal(submitted.draft.notes,'Observação ajustada');
 }finally{await browser.close();await new Promise<void>(r=>server.close(()=>r()));}
});
