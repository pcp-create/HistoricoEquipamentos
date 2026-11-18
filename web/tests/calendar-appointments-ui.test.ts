import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {build} from 'esbuild';
import {chromium,expect} from '@playwright/test';
test('general calendar selects all employees and saves an all-day absence',async()=>{
 const compiled=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import Calendar from './components/unified-calendar';createRoot(document.getElementById('root')).render(<Calendar general initialDay="2026-11-18"/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,jsx:'automatic',outdir:'out'});
 const requests:string[]=[];let saved:any;
 const server=createServer(async(req,res)=>{
  if(req.url?.startsWith('/api/calendar')){res.setHeader('Content-Type','application/json');if(req.method==='POST'){let raw='';for await(const part of req)raw+=part;saved=JSON.parse(raw);res.end(JSON.stringify({saved:true}));return;}requests.push(req.url);res.end(JSON.stringify({email:'one@test',employees:[{id:'one@test',name:'Funcionário Um'},{id:'two@test',name:'Funcionário Dois'}],events:[],updatedAt:new Date().toISOString()}));return;}
  res.setHeader('Content-Type','text/html');res.end(`<style>${compiled.outputFiles.find(f=>f.path.endsWith('.css'))!.text}</style><div id="root"></div><script>${compiled.outputFiles.find(f=>f.path.endsWith('.js'))!.text}</script>`);
 });
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch();
 try{const page=await browser.newPage({viewport:{width:390,height:844}});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+(server.address() as any).port);
 await page.getByLabel('Funcionário',{exact:true}).selectOption('all');await expect.poll(()=>requests.some(u=>u.includes('employee=all'))).toBe(true);
 await page.getByLabel('Funcionário',{exact:true}).selectOption('two@test');await expect.poll(()=>requests.some(u=>u.includes('employee=two%40test'))).toBe(true);
 await page.getByRole('button',{name:'Novo compromisso'}).click();const dialog=page.getByRole('dialog',{name:'Compromisso do calendário'});
 await expect(dialog.getByLabel('Funcionário',{exact:true})).toBeDisabled();
 await expect(dialog.getByLabel('Visibilidade',{exact:true})).toHaveValue('team');
 await dialog.getByLabel('Tipo',{exact:true}).selectOption('leave');await dialog.getByLabel('Título',{exact:true}).fill('Folga compensatória');
 await dialog.getByLabel('Dia inteiro',{exact:true}).check();await dialog.getByLabel('Início',{exact:true}).fill('2026-11-18');await dialog.getByLabel('Término',{exact:true}).fill('2026-11-19');await dialog.getByLabel('Visibilidade',{exact:true}).selectOption('team');
 await dialog.getByRole('button',{name:'Salvar compromisso'}).click();await expect(dialog).toHaveCount(0);
 assert.equal(saved.start,'2026-11-18T00:00');assert.equal(saved.end,'2026-11-19T23:59');assert.equal(saved.owner,'one@test');assert.equal(saved.kind,'leave');assert.equal(saved.visibility,'team');assert.deepEqual(errors,[]);
 }finally{await browser.close();await new Promise<void>(r=>server.close(()=>r()));}
});
