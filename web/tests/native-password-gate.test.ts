import {test} from 'node:test';
import {build} from 'esbuild';
import {chromium,expect} from '@playwright/test';
import path from 'node:path';
test('native gate requires password before opening portal',async()=>{
 const bundle=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import Gate from './components/native-password-gate';createRoot(document.getElementById('root')).render(<Gate><h1>Portal liberado</h1></Gate>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',jsx:'automatic',alias:{'@':path.resolve('.')},define:{'process.env.NODE_ENV':'"production"'}});
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage();let required=true;
  await page.route('http://native.test/**',async route=>{
   const url=new URL(route.request().url());
   if(url.pathname==='/api/session')return route.fulfill({json:{mustChangePassword:required}});
   if(url.pathname==='/api/password'){required=false;return route.fulfill({json:{ok:true}});}
   if(url.pathname==='/app.js')return route.fulfill({contentType:'text/javascript',body:bundle.outputFiles[0].text});
   return route.fulfill({contentType:'text/html',body:'<div id="root"></div><script src="/app.js"></script>'});
  });
  await page.goto('http://native.test/tecnico');
  await expect(page.getByRole('heading',{name:'Defina sua nova senha'})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Portal liberado'})).toHaveCount(0);
  await page.getByLabel('Nova senha',{exact:true}).fill('nova-senha-teste');
  await page.getByLabel('Confirmar nova senha').fill('nova-senha-teste');
  await page.getByRole('button',{name:'Salvar nova senha'}).click();
  await expect(page.getByRole('heading',{name:'Portal liberado'})).toBeVisible();
 }finally{await browser.close();}
});
