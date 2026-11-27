import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';
import {readFileSync} from 'node:fs';
test('stage settings list terminal stages, save units and allow disabling limits',async()=>{
 const js=await build({stdin:{contents:'import React from "react";import {createRoot} from "react-dom/client";import Settings from "./components/crm-stage-limits";createRoot(document.getElementById("root")).render(<Settings/>);',resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,jsx:'automatic',loader:{'.css':'empty'}});
 const browser=await chromium.launch();
 try {
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  let config:any={version:1,limits:{'proposal:creating':60}};
  await page.route('http://crm.test/**',async route=>{
   if(route.request().url().includes('/api/crm')){
    if(route.request().method()==='POST'){
     const body=route.request().postDataJSON();assert.equal(body.action,'save-stage-limits');assert.equal(body.version,config.version);
     config={limits:body.limits,version:config.version+1};
    }
    return route.fulfill({contentType:'application/json',body:JSON.stringify(config)});
   }
   return route.fulfill({contentType:'text/html',body:'<div id="root"></div>'});
  });
  await page.goto('http://crm.test');
  await page.addStyleTag({content:readFileSync('app/globals.css','utf8')+readFileSync('components/crm.css','utf8')});
  await page.addScriptTag({content:js.outputFiles[0].text});
  const creation=page.getByRole('spinbutton',{name:'Tempo máximo · Proposta · Em criação',exact:true});
  await creation.waitFor();assert.equal(await creation.inputValue(),'1');
  assert.equal(await page.getByText('Outra proposta ganha',{exact:true}).count(),1);
  assert.equal(await page.getByText('Encerrada — sem alertas de atraso',{exact:true}).count(),8);
  await creation.fill('2');
  await page.getByRole('combobox',{name:'Unidade · proposal · Em criação',exact:true}).selectOption('1440');
  await page.getByRole('spinbutton',{name:'Tempo máximo · Oportunidade · Prospecção',exact:true}).fill('30');
  await page.getByRole('combobox',{name:'Unidade · opportunity · Prospecção',exact:true}).selectOption('1');
  await page.getByRole('button',{name:'Salvar tempos',exact:true}).click();
  await page.getByRole('status').waitFor();
  assert.deepEqual(config.limits,{'proposal:creating':2880,'opportunity:prospecting':30});
  await creation.fill('');
  await page.getByRole('button',{name:'Salvar tempos',exact:true}).click();
  await page.getByRole('status').waitFor();
  assert.deepEqual(config.limits,{'opportunity:prospecting':30});
  await page.screenshot({path:'/tmp/crm-stage-settings-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'/tmp/crm-stage-settings-mobile.png',fullPage:true});
 } finally {await browser.close();}
});
