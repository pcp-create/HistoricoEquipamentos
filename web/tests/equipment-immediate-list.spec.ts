import {test,expect} from '@playwright/test';
import {build} from 'esbuild';
test('confirmed registration invalidates the equipment cache and announces the new equipment',async({page})=>{
 const bundle=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import Register from './components/workshop-register-equipment';import{apiFetch}from './lib/client-api-cache';window.readEquipment=async()=>{await apiFetch('/api/equipment-management?all=1')};window.addEventListener('equipment-created',()=>window.announced=true);window.readEquipment().then(()=>createRoot(document.getElementById('root')).render(<Register onBusy={()=>{}} onCancel={()=>{}} onCreated={v=>{window.created=v}}/>));`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,jsx:'automatic'});
 let reads=0;
 await page.route('**/immediate-equipment-test',r=>r.fulfill({contentType:'text/html',body:'<meta name="app-cache-scope" content="test"><div id="root"></div>'}));
 await page.route('**/api/equipment-management?all=1',r=>{reads++;return r.fulfill({json:{rows:[]}})});
 await page.route('**/api/workshop/equipment',r=>r.fulfill({json:{state:'complete',equipment:{id:'500',name:'Compressor',model:'GA30',serial:'SN500'}}}));
 await page.goto('/immediate-equipment-test');await page.addScriptTag({content:bundle.outputFiles[0].text});
 const form=page.getByRole('region',{name:'Adicionar equipamento'});await expect(form).toBeVisible();
 await page.evaluate(()=>(window as any).readEquipment());expect(reads).toBe(1);
 await form.getByRole('combobox',{name:'Tipo do equipamento *',exact:true}).selectOption('screw');await form.getByLabel('Modelo *',{exact:true}).fill('GA30');await form.getByLabel('Série *',{exact:true}).fill('SN500');await form.getByRole('button',{name:'Cadastrar e selecionar'}).click();
 await expect.poll(()=>page.evaluate(()=>(window as any).created?.id)).toBe('500');expect(await page.evaluate(()=>(window as any).announced)).toBe(true);
 await page.evaluate(()=>(window as any).readEquipment());expect(reads).toBe(2);
});
