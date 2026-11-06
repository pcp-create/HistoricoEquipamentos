import {test} from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';import {createServer} from 'node:http';import {chromium,expect} from '@playwright/test';
test('Gmail creates a draft with attachment in the connected account; email defaults are configurable',async()=>{
 const compiled=await build({stdin:{contents:`import React,{useState}from'react';import{createRoot}from'react-dom/client';import Email from'./components/customer-report-email';import Settings from'./components/schedule-customer-email-settings';function App(){const[settings,setSettings]=useState({customerEmail:{subject:'OS {os} · {cliente}',body:'Olá {cliente}, segue relatório. {responsavel}',gmailClientId:'123-public.apps.googleusercontent.com'}});return <><Email data={{schedule:{id:1,company_id:1,order_id:100},detail:{order:{numero_sequencia:15253,cliente_nome:'Cliente Teste'}},settings:{document:settings},email:'planner@test.com',users:[{email:'planner@test.com',display_name:'Planejador'}]}} onClose={()=>{}}/><Settings settings={settings} onChange={setSettings} onSave={async s=>{window.saved=s;return true}} busy={false}/></>}createRoot(document.getElementById('root')).render(<App/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,outfile:'app.js',platform:'browser',jsx:'automatic'});
 const server=createServer((req,res)=>{if(req.url==='/app.js'){res.setHeader('Content-Type','text/javascript');res.end(compiled.outputFiles[0].text);}else{res.setHeader('Content-Type','text/html');res.end('<div id="root"></div><script src="/app.js"></script>');}});await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch();
 try{
 const page=await browser.newPage();await page.addInitScript("window.google={accounts:{oauth2:{initTokenClient:function(options){return {requestAccessToken:function(){options.callback({access_token:'test-token'})}}}}}};window.open=function(url){window.opened=String(url);return null;};");
 await page.route('https://accounts.google.com/**',r=>r.abort());
 let prepared:any,draft:any;
 const raw=Buffer.from('MIME-Version: 1.0\r\nContent-Type: application/pdf\r\n').toString('base64url');
 await page.route('**/api/service-scheduling/customer-email',r=>{prepared=r.request().postDataJSON();return r.fulfill({json:{raw,filename:'OS 15253.eml'}})});
 await page.route('https://gmail.googleapis.com/**',r=>{assert.ok(r.request().url().endsWith('/drafts'),'never calls an email sending endpoint');draft=r.request().postDataJSON();return r.fulfill({json:{id:'draft1',message:{id:'m1'}}});});
 await page.route('https://openidconnect.googleapis.com/v1/userinfo',r=>r.fulfill({json:{email:'connected@gmail.com'}}));
 await page.goto('http://127.0.0.1:'+(server.address() as any).port);
 await expect(page.getByLabel('Assunto',{exact:true})).toHaveValue('OS 15253 · Cliente Teste');
 await expect(page.getByLabel('Mensagem',{exact:true})).toHaveValue('Olá Cliente Teste, segue relatório. Planejador');
 await page.getByLabel('Destinatário',{exact:true}).fill('cliente@example.com');
 await page.getByRole('button',{name:'Criar rascunho no Gmail',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('Rascunho criado no Gmail');
 assert.equal(prepared.to,'cliente@example.com');assert.equal(draft.message.raw,raw);
 assert.match(await page.evaluate(()=>(window as any).opened),/authuser=connected%40gmail.com#drafts/);
 await page.getByLabel('Texto padrão do e-mail',{exact:true}).fill('Novo texto da OS {os}');
 await page.getByRole('button',{name:'Salvar configuração de e-mail'}).click();
 assert.equal(await page.evaluate(()=>(window as any).saved.customerEmail.body),'Novo texto da OS {os}');
 }finally{await browser.close();await new Promise<void>(r=>server.close(()=>r()));}
});
