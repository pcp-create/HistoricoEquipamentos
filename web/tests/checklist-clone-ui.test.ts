import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createServer} from 'node:http';
import {chromium,expect} from '@playwright/test';
import ccp from '../lib/service-scheduling/templates/ccp.json';
import {validateChecklists} from '../lib/service-scheduling/checklists';

test('clone copies every checklist setting, opens an independent editor and saves both templates',async()=>{
 const original={...structuredClone(ccp),m8Identifier:'CORRETIVA'};
 const compiled=await build({stdin:{contents:`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import Editor from './components/schedule-checklist-editor';function App(){const [settings,setSettings]=useState({checklists:[${JSON.stringify(original)}]});return <Editor settings={settings} onChange={setSettings} attendanceTypes={['CORRETIVA']} onSave={async value=>{window.saved=structuredClone(value);return true;}}/>}createRoot(document.getElementById('root')).render(<App/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',jsx:'automatic',outfile:'app.js'});
 const server=createServer((req,res)=>{if(req.url==='/app.js'){res.setHeader('Content-Type','text/javascript');res.end(compiled.outputFiles.find(f=>f.path.endsWith('.js'))!.text);}else{res.setHeader('Content-Type','text/html');res.end('<div id="root"></div><script src="/app.js"></script>');}});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage();await page.goto('http://127.0.0.1:'+(server.address() as any).port);
  await expect(page.getByRole('button',{name:'Usar modelo CCP'})).toHaveCount(0);
  await page.getByRole('button',{name:'Clonar checklist '+original.name,exact:true}).click();
  await expect(page.getByLabel('Nome',{exact:true})).toHaveValue('Cópia '+original.name);
  await page.getByRole('button',{name:'Salvar checklists',exact:true}).click();
  const saved=await page.evaluate(()=>(window as any).saved);
  assert.equal(saved.checklists.length,2);assert.deepEqual(saved.checklists[0],original);
  const clone=saved.checklists[1];assert.notEqual(clone.id,original.id);
  assert.deepEqual(clone,{...original,id:clone.id,name:'Cópia '+original.name});
  validateChecklists(saved.checklists);
  await page.getByLabel('Nome',{exact:true}).fill('Cópia ajustada');
  await page.getByRole('button',{name:'Salvar checklists',exact:true}).click();
  assert.deepEqual(await page.evaluate(()=>(window as any).saved.checklists[0]),original);
  await page.getByRole('button',{name:'← Voltar à lista',exact:true}).click();
  await expect(page.getByRole('button',{name:/Clonar checklist/})).toHaveCount(2);
 }finally{await browser.close();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
