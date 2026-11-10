import {test} from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';import {createServer} from 'node:http';import {chromium,expect} from '@playwright/test';
test('APK sync panel allows downloads with pending failures and asks before discarding a dependent branch',async()=>{
 const compiled=await build({stdin:{contents:`import React from'react';import{createRoot}from'react-dom/client';import Offline from'./components/field-offline';createRoot(document.getElementById('root')).render(<Offline open={true} onClose={()=>{}} onSynced={()=>{}}/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,outfile:'app.js',platform:'browser',jsx:'automatic'});
 const server=createServer((req,res)=>{if(req.url==='/app.js'){res.setHeader('Content-Type','text/javascript');res.end(compiled.outputFiles.find(file=>file.path.endsWith('.js'))!.text);}else{res.setHeader('Content-Type','text/html');res.end('<div id="root"></div><script src="/app.js"></script>');}});await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch();
 try{
  const page=await browser.newPage();await page.addInitScript(`
   window.messages=[];
   let queue=[{id:'failed',action:'report_save',operationId:'a',operationLabel:'OS 15148 / OP02',at:new Date().toISOString(),error:'Conflito de versão',dependents:1,canRetry:true},{id:'dependent',action:'report_save',operationId:'a',operationLabel:'OS 15148 / OP02',at:new Date().toISOString(),blockedReason:'Depende de uma falha'},{id:'other',action:'info_read',operationId:'b',operationLabel:'OS 15500 / OP01',at:new Date().toISOString()}],discarded=0;
   window.RJOffline={connection:async function(){return true;},message:async function(type,payload){window.messages.push({type,payload});if(type==='FIELD_DISCARD'){queue=queue.filter(function(v){return v.id!==payload.id&&!(payload.includeDependents&&v.id==='dependent');});discarded=2;}return {ok:true,connected:true,serverConnected:true,pending:queue.length,queue,discarded,prepared:new Date().toISOString(),syncing:false};}};
  `);await page.route('**/api/field',r=>r.fulfill({json:{email:'tech'}}));
  await page.goto('http://127.0.0.1:'+(server.address() as any).port);
  const panel=page.getByRole('dialog',{name:'Sincronismo',exact:true});
  await expect(panel.getByRole('button',{name:'Baixar programação',exact:true})).toBeEnabled();
  await panel.getByRole('button',{name:'Baixar programação',exact:true}).click();
  await expect(panel.getByRole('button',{name:'Reprocessar este registro',exact:true})).toHaveCount(1);
  await panel.getByRole('button',{name:'Reprocessar este registro',exact:true}).click();
  assert.deepEqual(await page.evaluate(()=>(window as any).messages.find((v:any)=>v.type==='FIELD_RETRY').payload),{id:'failed'});
  await panel.getByRole('button',{name:'Excluir pendência',exact:true}).first().click();
  const confirm=page.getByRole('alertdialog',{name:'Excluir pendência de envio',exact:true});
  await expect(confirm).toContainText('1 registro(s) dependente(s)');
  await confirm.getByRole('button',{name:'Cancelar exclusão',exact:true}).click();
  assert.equal(await page.evaluate(()=>(window as any).messages.filter((v:any)=>v.type==='FIELD_DISCARD').length),0);
  await panel.getByRole('button',{name:'Excluir pendência',exact:true}).first().click();
  await confirm.getByRole('checkbox',{name:/Excluir também/}).check();
  await confirm.getByRole('button',{name:'Confirmar exclusão',exact:true}).click();
  await expect(confirm).toHaveCount(0);await expect(panel.getByText('OS 15500 / OP01',{exact:false})).toBeVisible();
  assert.deepEqual(await page.evaluate(()=>(window as any).messages.find((v:any)=>v.type==='FIELD_DISCARD').payload),{id:'failed',includeDependents:true});
  assert.ok(await page.evaluate(()=>(window as any).messages.some((v:any)=>v.type==='FIELD_PREPARE')));
 }finally{await browser.close();await new Promise<void>(r=>server.close(()=>r()));}
});
