import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {build} from 'esbuild';
import {chromium,expect} from '@playwright/test';
test('web PDF opens without a service worker and reserves its tab before fetching',async()=>{
 const compiled=await build({stdin:{contents:"import React from 'react';import{createRoot}from'react-dom/client';import Pdf from './components/field-pdf-button';createRoot(document.getElementById('root')).render(<Pdf scheduleId='12'/>);",resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,outfile:'app.js',platform:'browser',jsx:'automatic'});
 let requests=0;
 const server=createServer((req,res)=>{
  if(req.url==='/app.js'){res.setHeader('Content-Type','text/javascript');res.end(compiled.outputFiles.find(f=>f.path.endsWith('.js'))!.text);return;}
  if(req.url?.startsWith('/api/field/report')){requests++;assert.match(req.url,/scheduleId=12/);res.setHeader('Content-Type','application/pdf');res.end('%PDF-1.4\n%%EOF');return;}
  res.setHeader('Content-Type','text/html');res.end('<div id="root"></div><script src="/app.js"></script>');
 });
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage();await page.goto('http://127.0.0.1:'+(server.address() as any).port);
  assert.equal(await page.evaluate(()=>!!navigator.serviceWorker.controller),false);
  await page.getByRole('button',{name:'Gerar Relatório OS',exact:true}).click();
  let downloaded=false;page.on('popup',p=>p.on('download',()=>{downloaded=true}));
  const popupPromise=page.waitForEvent('popup');
  await page.getByRole('button',{name:'Completo',exact:true}).click();
  const popup=await popupPromise;
  await expect.poll(()=>requests).toBe(1);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect.poll(()=>downloaded||popup.url().startsWith('blob:')).toBe(true);
 }finally{await browser.close();await new Promise<void>(r=>server.close(()=>r()));}
});
