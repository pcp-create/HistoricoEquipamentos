import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {build} from 'esbuild';
import {chromium,expect} from '@playwright/test';
import {contactJobLabel} from '../lib/contact-job-label';
test('contact job label tolerates contacts still loading and preserves ERP labels',()=>{
 assert.equal(contactJobLabel(undefined),'');assert.equal(contactJobLabel(null),'');
 assert.equal(contactJobLabel({job_title:'7 - Compras',cargo_id:7}),'Compras');
});
test('recorded visit opens a fresh next appointment on mobile without losing customer',async()=>{
 const customer={key:'m8:1',name:'Cliente teste',document:'123',city:'Lages',uf:'SC',address:'Rua Um',lead:false,latitude:null,longitude:null,lastVisit:null,health:'overdue'};
 const code=`import React from 'react';import{createRoot}from'react-dom/client';import Visits from './components/sales-visits';const customer=${JSON.stringify(customer)};createRoot(document.getElementById('root')).render(<Visits scheduleOnly initialMode="history" initialCustomer={customer} initialSeller="seller@test"/>);`;
 const compiled=await build({stdin:{contents:code,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,jsx:'automatic',outdir:'out',loader:{'.png':'dataurl'}});
 const writes:any[]=[];const errors:string[]=[];let contactLoads=0;
 const server=createServer(async(req,res)=>{
  res.setHeader('Content-Type','application/json');
  if(req.url==='/api/visits'||req.url==='/api/visits/management'){
   if(req.method==='POST'){let raw='';for await(const part of req)raw+=part;writes.push(JSON.parse(raw));res.end(JSON.stringify({saved:true}));}
   else res.end(JSON.stringify({email:'seller@test',name:'Visitante',assignees:[{id:'seller@test',name:'Visitante'}],purposes:[{id:'1',name:'Prospecção',active:true}],customers:[customer],visits:[]}));return;
  }
  if(req.url?.startsWith('/api/visits/machines')){res.end(JSON.stringify({machines:[],equipment:[]}));return;}
  if(req.url?.startsWith('/api/customer-contacts')){if(++contactLoads>1)await new Promise(r=>setTimeout(r,300));res.end(JSON.stringify({contacts:[{id:'contact',name:'João',phone:'49999999999'}]}));return;}
  if(req.url?.startsWith('/api/contact-job-types')){res.end(JSON.stringify({rows:[]}));return;}
  res.setHeader('Content-Type','text/html');res.end(`<style>${compiled.outputFiles.find(f=>f.path.endsWith('.css'))!.text}</style><div id="root"></div><script>${compiled.outputFiles.find(f=>f.path.endsWith('.js'))!.text}</script>`);
 });
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch();
 try{const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});page.setDefaultTimeout(8000);page.on('pageerror',e=>errors.push(e.message));page.on('crash',()=>errors.push('crash'));
 await page.route('https://tile.openstreetmap.org/**',r=>r.abort());
 await page.goto('http://127.0.0.1:'+(server.address() as any).port,{waitUntil:'domcontentloaded'});
 await expect(page.getByRole('heading',{name:'Registrar visita realizada',exact:true})).toBeVisible();
 await page.getByRole('combobox',{name:'Finalidade da Visita',exact:true}).click();await page.getByRole('option',{name:/Prospecção/}).click();
 await page.getByRole('combobox',{name:'Contato que receberá a visita'}).click();await page.getByRole('option',{name:/João/}).click();
 await page.getByLabel('Registro da visita e próximos passos').fill('Visita realizada.');
 await page.getByRole('button',{name:'Salvar visita realizada',exact:true}).click();
 await page.getByRole('button',{name:'Fechar',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'Agendar próxima visita',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Agendar próxima visita',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Agendar visita',exact:true})).toBeVisible();
 await expect(page.getByRole('combobox',{name:'Cliente',exact:true})).toHaveValue(/Cliente teste/);
 await expect(page.getByLabel('Data e hora agendada',{exact:true})).toHaveValue('');
 await expect(page.getByRole('combobox',{name:'Contato que receberá a visita'})).toHaveValue('João');
 await page.getByLabel('Data e hora agendada',{exact:true}).fill('2027-01-15T10:00');
 await page.getByRole('combobox',{name:'Finalidade da Visita',exact:true}).click();await page.getByRole('option',{name:/Prospecção/}).click();
 await page.getByRole('button',{name:'Salvar agendamento',exact:true}).click();
 await expect.poll(()=>writes.length).toBe(2);
 assert.equal(writes[0].action,'history');assert.equal(writes[1].action,'schedule');
 assert.notEqual(writes[0].id,writes[1].id);assert.equal(writes[1].customer_key,customer.key);
 assert.equal(writes[1].contact_id,'contact');assert.equal(writes[1].outcome,'');
 assert.deepEqual(errors,[]);
 }catch(e){console.error('Browser errors:',errors);throw e;}finally{await browser.close();await new Promise<void>(r=>server.close(()=>r()));}
});
