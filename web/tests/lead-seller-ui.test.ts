import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {build} from 'esbuild';
import {chromium,expect} from '@playwright/test';
test('lead seller pencil opens editor, saves the selected seller and keeps other leads in full-base results',async()=>{
 const code=`import React from 'react';import{createRoot}from'react-dom/client';import Seller from './components/visit-lead-seller';import CustomerSelect from './components/sales-customer-select';import './components/sales-visits.css';function App(){const[owner,setOwner]=React.useState('a@test'),[full,setFull]=React.useState(false),[value,setValue]=React.useState('');const customer={key:'lead:11111111-1111-4111-8111-111111111111',lead:true,name:'Lead A',seller_ids:[owner],seller_names:[owner==='a@test'?'Vendedor A':'Vendedor B']};return <><Seller customer={customer} canEdit onSaved={()=>setOwner('b@test')}/><CustomerSelect customers={[customer]} value={value} onChange={setValue} fullBase={full} onFullBaseChange={setFull}/><p>Selecionado: {value}</p></>}createRoot(document.getElementById('root')).render(<App/>);`;
 const compiled=await build({stdin:{contents:code,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,jsx:'automatic',outdir:'out'});
 let saved:any;
 const server=createServer(async(req,res)=>{
  if(req.url?.startsWith('/api/visits/lead-seller')){
   res.setHeader('Content-Type','application/json');
   if(req.method==='POST'){let raw='';for await(const part of req)raw+=part;saved=JSON.parse(raw);res.end(JSON.stringify({saved:true}));}
   else res.end(JSON.stringify({owner:'a@test',sellers:[{id:'a@test',name:'Vendedor A'},{id:'b@test',name:'Vendedor B'}]}));return;
  }
  if(req.url?.startsWith('/api/visits/customers')){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({rows:[{id:'lead:other',name:'Lead de outro vendedor',detail:'Turvo/SC',data:{key:'lead:other',name:'Lead de outro vendedor',lead:true,seller_ids:['other@test']}}]}));return;}
  res.setHeader('Content-Type','text/html');res.end(`<style>${compiled.outputFiles.find(f=>f.path.endsWith('.css'))!.text}</style><div id="root"></div><script>${compiled.outputFiles.find(f=>f.path.endsWith('.js'))!.text}</script>`);
 });
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch();
 try{const page=await browser.newPage();await page.goto('http://127.0.0.1:'+(server.address() as any).port);
 await expect(page.getByText('Vendedor: Vendedor A',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Alterar vendedor responsável pelo lead'}).click();
 await page.getByLabel('Vendedor responsável pelo lead',{exact:true}).selectOption('b@test');
 await page.getByRole('button',{name:'Salvar responsável'}).click();
 await expect(page.getByText('Vendedor: Vendedor B',{exact:true})).toBeVisible();
 assert.equal(saved.seller,'b@test');assert.equal(saved.expectedOwner,'a@test');
 await expect(page.getByRole('status').filter({hasText:'Vendedor responsável pelo lead atualizado.'})).toBeVisible();
 await page.getByRole('combobox',{name:'Cliente',exact:true}).click();
 await page.getByRole('checkbox',{name:'Base completa de clientes e leads',exact:true}).check();
 await page.getByRole('combobox',{name:'Cliente',exact:true}).fill('outro');
 await page.getByRole('option',{name:/Lead de outro vendedor/}).click();
 await expect(page.getByText('Selecionado: lead:other',{exact:true})).toBeVisible();
 }finally{await browser.close();await new Promise<void>(r=>server.close(()=>r()));}
});
