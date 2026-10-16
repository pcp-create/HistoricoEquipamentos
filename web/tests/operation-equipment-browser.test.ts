import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readFileSync} from 'node:fs';
import {chromium} from '@playwright/test';

test('equipment picker starts with client machines, supports all, search and selection',async()=>{
 const compiled=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import Picker from './components/operation-equipment-select';function App(){const [equipment,setEquipment]=React.useState(null);return <Picker value={equipment?.equipment_id||""} label={equipment?.name||""} orderLabel="Compressor da OS" disabled={false} scheduleId="1" onChange={(id,e)=>{window.selected=id;setEquipment(e)}}/>}createRoot(document.getElementById('root')).render(<App/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',jsx:'automatic',loader:{'.css':'empty'}});
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage();const queries:string[]=[];
  await page.route('http://test.local/**',r=>{
   const u=new URL(r.request().url());
   if(u.pathname==='/')return r.fulfill({contentType:'text/html',body:'<div id="root"></div>'});
   queries.push(u.search);
   return r.fulfill({json:{rows:[{equipment_id:u.searchParams.get('scope')==='all'?'8':'7',name:u.searchParams.get('scope')==='all'?'Outro equipamento':'Equipamento do cliente',serial:'ABC'}],hasMore:false}});
  });
  await page.goto('http://test.local/');await page.addScriptTag({content:compiled.outputFiles[0].text});
  await page.addStyleTag({content:readFileSync('components/operation-equipment-select.css','utf8')});
  await page.getByRole('button',{name:'Compressor da OS',exact:true}).click();
  await page.getByRole('button',{name:/Equipamento do cliente/}).waitFor();
  assert.ok(queries.at(-1)?.includes('scope=client'));
  await page.screenshot({path:'/tmp/equipment-picker-desktop.png'});
  await page.setViewportSize({width:390,height:844});
  const bounds=await page.getByRole('dialog').boundingBox();
  assert.ok(bounds&&bounds.x>=0&&bounds.x+bounds.width<=390);
  await page.screenshot({path:'/tmp/equipment-picker-mobile.png'});
  await page.getByRole('button',{name:'Ver todos os equipamentos',exact:true}).click();
  await page.getByRole('button',{name:/Outro equipamento/}).waitFor();
  await page.getByLabel('Pesquisar equipamento',{exact:true}).fill('ABC');
  await page.waitForResponse(r=>r.url().includes('q=ABC'));
  await page.getByRole('button',{name:/Outro equipamento/}).click();
  assert.equal(await page.evaluate(()=>(window as any).selected),'8');
  assert.equal(await page.getByRole('dialog').count(),0);
  await page.getByRole('button',{name:'8 · Outro equipamento',exact:true}).click();
  await page.getByRole('button',{name:'Usar equipamento da OS',exact:true}).click();
  await page.getByRole('button',{name:'Compressor da OS',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>(window as any).selected),'');
 }finally{await browser.close()}
});

test('returned report unlocks answers and camera input while preserving photos',async()=>{
 const compiled=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import Run from './components/schedule-checklist-run';
 const template={id:'t',name:'Relatório',stages:[{id:'s',name:'Inspeção',fields:[{id:'text',label:'Resultado',type:'text'},{id:'photo',label:'Fotos',type:'photo'}]}]};
 const root=createRoot(document.getElementById('root'));window.render=returned=>{const run={template,reportReturnedAt:returned?'2026-10-16T12:00:00Z':'',stages:{s:{status:returned?'released':'submitted',answers:{text:'Anterior',photo:['1']}}}};root.render(<Run compact operation={{id:'op',status:returned?'executing':'awaiting_review',document:{responsible:'tech',support:[],checklistRun:run}}} data={{email:'tech',settings:{document:{checklists:[template]}},detail:{equipment_links:[]}}} mutate={()=>{}} busy={false} dirty={false}/>)};window.render(false);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',jsx:'automatic',loader:{'.css':'empty'}});
 const browser=await chromium.launch();try{
  const page=await browser.newPage();await page.setContent('<div id="root"></div>');await page.addStyleTag({content:readFileSync('components/report-photo-picker.css','utf8')});await page.addScriptTag({content:compiled.outputFiles[0].text});
  await page.locator('.checklist-stage-response > summary').click();
  assert.equal(await page.getByLabel('Resultado',{exact:true}).isDisabled(),true);
  await page.evaluate(()=>(window as any).render(true));
  await page.locator('.checklist-stage-response > summary').click();
  await page.getByLabel('Resultado',{exact:true}).fill('Corrigido');
  const camera=page.getByLabel('Tirar foto: Fotos',{exact:true});
  assert.equal(await camera.isEnabled(),true);
  assert.equal(await camera.getAttribute('capture'),'environment');
  assert.equal(await camera.getAttribute('multiple'),null);
  assert.equal(await page.getByLabel('Selecionar fotos: Fotos',{exact:true}).isEnabled(),true);
  assert.equal(await page.locator('.checklist-photos img').count(),1);
  await page.getByRole('button',{name:'Adicionar fotos: Fotos',exact:true}).click();
  const galleryChooser=page.waitForEvent('filechooser');
  await page.getByRole('button',{name:/Escolher da galeria/}).click();
  assert.equal((await galleryChooser).isMultiple(),true);
  await page.getByRole('button',{name:'Adicionar fotos: Fotos',exact:true}).click();
  const cameraChooser=page.waitForEvent('filechooser');
  await page.getByRole('button',{name:/Tirar foto/}).click();
  assert.equal((await cameraChooser).isMultiple(),false);

 }finally{await browser.close()}
});

test('meter reference displays the preventive reading and collection date for the selected machine',async()=>{
 const compiled=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import Reference from './components/equipment-meter-reference';const root=createRoot(document.getElementById('root'));window.select=id=>root.render(<Reference equipmentId={id}/>);window.select('7');`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',jsx:'automatic'});
 const browser=await chromium.launch();try{
  const page=await browser.newPage();
  await page.route('http://test.local/**',r=>r.request().url().includes('reading=')?r.fulfill({json:r.request().url().endsWith('7')?{meter:12345,meterDate:'2026-10-15'}:{meter:null,meterDate:null}}):r.fulfill({contentType:'text/html',body:'<div id="root"></div>'}));
  await page.goto('http://test.local');await page.addScriptTag({content:compiled.outputFiles[0].text});
  await page.getByText('12.345 h',{exact:true}).waitFor();
  assert.match(await page.getByRole('status').innerText(),/15\/10\/2026/);
  await page.evaluate(()=>(window as any).select('8'));
  await page.getByText('Nenhuma coleta de horímetro cadastrada nas preventivas.',{exact:true}).waitFor();
  assert.equal(await page.getByText('12.345 h',{exact:true}).count(),0);
 }finally{await browser.close()}
});

test('cancelling gallery or camera does not navigate away from the operation',async()=>{
 const compiled=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import Screen from './components/field-report-screen';import Picker from './components/report-photo-picker';window.closedCount=0;createRoot(document.getElementById('root')).render(<Screen open busy={false} title="OP01" onClose={()=>window.closedCount++}><textarea aria-label="Rascunho" defaultValue="Texto preservado"/><Picker label="Fotos" onSelect={()=>{}}/></Screen>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',jsx:'automatic',loader:{'.css':'empty'}});
 const browser=await chromium.launch();try{
  const page=await browser.newPage();await page.setContent('<div id="root"></div>');await page.addStyleTag({content:readFileSync('components/report-photo-picker.css','utf8')});await page.addScriptTag({content:compiled.outputFiles[0].text});
  await page.getByRole('dialog').waitFor();
  for(const source of ['Escolher da galeria','Tirar foto']){
   await page.getByRole('button',{name:'Adicionar fotos: Fotos',exact:true}).click();
   const chooser=page.waitForEvent('filechooser');
   await page.getByRole('button',{name:new RegExp(source)}).click();await chooser;
   const input=page.getByLabel(source==='Tirar foto'?'Tirar foto: Fotos':'Selecionar fotos: Fotos',{exact:true});
   await input.dispatchEvent('cancel',{bubbles:true});
   assert.equal(await page.evaluate(()=>(window as any).closedCount),0);
   assert.equal(await page.getByLabel('Rascunho').inputValue(),'Texto preservado');
   assert.equal(await page.getByRole('dialog').isVisible(),true);
  }
  // A genuine dialog cancellation still follows the Back action.
  await page.getByRole('dialog').dispatchEvent('cancel',{bubbles:false,cancelable:true});
  assert.equal(await page.evaluate(()=>(window as any).closedCount),1);
 }finally{await browser.close()}
});
